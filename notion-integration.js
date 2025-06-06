/**
 * Notion連携クラス
 * Notionとの連携機能を担当
 */
class NotionIntegration {
  
  /**
   * 1時間ごとのNotion連携
   */
  static pushToNotionHourly() {
    try {
      // プロジェクト設定のタイムゾーンで現在時刻を取得
      const now = Config.getNow();
      
      // 今日の0時0分0秒を明確に設定（日付境界を明確に）
      const todayStart = Config.getTodayStart(now);
      
      // 昨日の日付を計算
      const yesterday = Config.getYesterday(now);
      const sheet = MessageHistory.getMainSheet();
      const data = sheet.getDataRange().getValues();

      // 日付変更時（0時台）に前日の記事を最終更新
      if (now.getHours() === 0) {
        Logger.log("日付変更を検知しました。前日記事の最終更新を実行します。");
        this.finalizePreviousDayArticle(yesterday, data);
      }

      // 今日の行だけ抽出（今日の0時0分0秒から現在時刻まで）
      const todayEntries = data.slice(1).filter(row => {
        const ts = new Date(row[0]);
        return ts >= todayStart && ts <= now;
      });

      // データがない場合は何もしない
      if (todayEntries.length === 0) {
        Logger.log("今日のデータがないため、Notion更新をスキップします。（対象期間: " + 
                   Config.formatDate(todayStart) + 
                   " - " + 
                   Config.formatDate(now) + "）");
        return;
      }
      
      Logger.log("今日のデータを " + todayEntries.length + " 件取得しました。（対象期間: " + 
                 Config.formatDate(todayStart) + 
                 " - " + 
                 Config.formatDate(now) + "）");

      // 今日の記事が既に存在するかチェック
      const existingPageId = this.findTodayNotionPage(todayStart);
      
      // 変更がある場合のみ処理を実行
      let hasChanges = false;
      let lastUpdateTime = null;
      
      if (existingPageId) {
        // 既存記事の最終更新時刻を取得
        lastUpdateTime = this.getPageLastModified(existingPageId);
        
        // 最後の更新以降に新しいデータがあるかチェック
        if (lastUpdateTime) {
          const newDataSinceUpdate = todayEntries.filter(row => {
            const rowTimestamp = new Date(row[0]);
            return rowTimestamp > lastUpdateTime;
          });
          
          if (newDataSinceUpdate.length > 0) {
            hasChanges = true;
            Logger.log("新しいデータが " + newDataSinceUpdate.length + " 件見つかりました。更新を実行します。");
          } else {
            Logger.log("新しいデータがありません。更新をスキップします。");
            return;
          }
        } else {
          // 最終更新時刻が取得できない場合は更新する
          hasChanges = true;
          Logger.log("最終更新時刻が取得できませんでした。安全のため更新を実行します。");
        }
      } else {
        // 新規作成の場合
        hasChanges = true;
        Logger.log("今日の記事が存在しません。新規作成します。");
      }
      
      // 変更がある場合のみ処理を実行
      if (!hasChanges) {
        return;
      }

      this.processHourlyUpdate(todayEntries, existingPageId, todayStart, now);
      
    } catch (error) {
      Logger.log("Error in pushToNotionHourly: " + error.message);
      ErrorLogger.log("pushToNotionHourly Error", error.message + (error.stack ? "\n" + error.stack : ""));
    }
  }

  /**
   * 月次Notion連携メイン関数（実行ごとに1ユーザー）
   */
  static pushToNotionMonthly() {
    try {
      const processedMonthStr = this.getProcessedMonth(); // "YYYY-MM"
      const monthlyStatusKey = this.getMonthlyStatusKey(processedMonthStr);

      this.deleteOldMonthlyStatusKeys(monthlyStatusKey);

      const properties = PropertiesService.getScriptProperties();
      let monthlyStatusJSON = properties.getProperty(monthlyStatusKey);
      let monthlyStatus = monthlyStatusJSON ? JSON.parse(monthlyStatusJSON) : {};

      // ステータスが初期化されていない場合（その月の初回処理時など）
      if (Object.keys(monthlyStatus).length === 0) {
        monthlyStatus = this.initializeMonthlyStatus(processedMonthStr);
        if (Object.keys(monthlyStatus).length === 0) {
          Logger.log(processedMonthStr + "に発言のあったユーザーはいませんでした。");
          properties.setProperty(monthlyStatusKey, JSON.stringify({}));
          return;
        }
        properties.setProperty(monthlyStatusKey, JSON.stringify(monthlyStatus));
        Logger.log(processedMonthStr + "の月次処理ステータスを初期化しました: " + JSON.stringify(monthlyStatus));
      }

      // 未処理のユーザーを検索
      const unprocessedUserId = this.findUnprocessedUser(monthlyStatus);
      if (!unprocessedUserId) {
        Logger.log(processedMonthStr + "の全ユーザーの月次Notion連携は完了しています。");
        return;
      }

      Logger.log(processedMonthStr + "の未処理ユーザーを発見: " + unprocessedUserId + ". Notionページ作成を開始します。");

      // ユーザーのコメントを取得してNotionページを作成
      this.processMonthlyUserData(unprocessedUserId, processedMonthStr, monthlyStatus, monthlyStatusKey);

    } catch (error) {
      Logger.log("Error in pushToNotionMonthly: " + error.message + (error.stack ? "\n" + error.stack : ""));
      ErrorLogger.log("pushToNotionMonthly Exception", error.message + (error.stack ? "\n" + error.stack : ""));
    }
  }

  /**
   * 実行日基準で「前月」の年月 (YYYY-MM形式) を返す
   */
  static getProcessedMonth() {
    const now = Config.getNow();
    now.setDate(0); // 前月の末日に設定
    return Config.formatDate(now, "yyyy-MM");
  }

  /**
   * 年月を元に ScriptProperties で使用するキー名を生成
   */
  static getMonthlyStatusKey(yyyymm) {
    return "MONTHLY_EXPORT_STATUS_" + yyyymm;
  }

  /**
   * 現在処理中のキーより古い月次ステータスキーを削除
   */
  static deleteOldMonthlyStatusKeys(currentProcessingMonthKey) {
    const properties = PropertiesService.getScriptProperties();
    const allKeys = properties.getKeys();
    const currentPrefix = "MONTHLY_EXPORT_STATUS_";
    const currentSuffix = currentProcessingMonthKey.replace(currentPrefix, "");

    allKeys.forEach(key => {
      if (key.startsWith(currentPrefix)) {
        const keySuffix = key.replace(currentPrefix, "");
        if (keySuffix < currentSuffix) {
          properties.deleteProperty(key);
          Logger.log("Deleted old status key: " + key);
        }
      }
    });
  }

  /**
   * 月次ステータスを初期化
   */
  static initializeMonthlyStatus(processedMonthStr) {
    const sheet = MessageHistory.getMainSheet();
    const data = sheet.getDataRange().getValues();
    const usersInMonth = {};

    // 前月の1日と末日を計算
    const firstDayOfProcessedMonth = new Date(processedMonthStr + "-01T00:00:00");
    const tempDate = new Date(firstDayOfProcessedMonth);
    tempDate.setMonth(tempDate.getMonth() + 1);
    tempDate.setDate(0); // 前月の末日
    const lastDayOfProcessedMonth = new Date(tempDate.getFullYear(), tempDate.getMonth(), tempDate.getDate(), 23, 59, 59);

    for (let i = 1; i < data.length; i++) { // ヘッダー行をスキップ
      const timestamp = new Date(data[i][0]);
      if (timestamp >= firstDayOfProcessedMonth && timestamp <= lastDayOfProcessedMonth) {
        const userId = data[i][1];
        if (userId) {
          usersInMonth[userId] = false; // 未処理としてマーク
        }
      }
    }

    return usersInMonth;
  }

  /**
   * 未処理のユーザーを検索
   */
  static findUnprocessedUser(monthlyStatus) {
    for (const userIdKey in monthlyStatus) {
      if (monthlyStatus.hasOwnProperty(userIdKey) && !monthlyStatus[userIdKey]) {
        return userIdKey;
      }
    }
    return null;
  }

  /**
   * 月次ユーザーデータを処理してNotionページを作成
   */
  static processMonthlyUserData(unprocessedUserId, processedMonthStr, monthlyStatus, monthlyStatusKey) {
    try {
      const userComments = this.getUserCommentsForMonth(unprocessedUserId, processedMonthStr);
      
      if (userComments.length === 0) {
        Logger.log("ユーザー " + unprocessedUserId + " の " + processedMonthStr + " のコメントは見つかりませんでした。ステータスを更新します。");
        monthlyStatus[unprocessedUserId] = true;
        PropertiesService.getScriptProperties().setProperty(monthlyStatusKey, JSON.stringify(monthlyStatus));
        return;
      }

      // コメントを時系列順にソート
      userComments.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

      const userName = UserManager.getDisplayName(unprocessedUserId) || "名前未設定ユーザー (" + unprocessedUserId.substring(0, 8) + ")";
      const notionPageTitle = userName + "さんの" + processedMonthStr.replace("-", "年") + "月のおきもち";

      // Notionブロックを生成
      const notionBlocks = this.generateMonthlyNotionBlocks(userComments);

      // Notionページを作成
      const success = this.createMonthlyNotionPage(notionPageTitle, notionBlocks, processedMonthStr, userName);

      if (success) {
        Logger.log("Notionページを正常に作成しました for user: " + unprocessedUserId + ", month: " + processedMonthStr + ". Title: " + notionPageTitle);
        monthlyStatus[unprocessedUserId] = true;
        PropertiesService.getScriptProperties().setProperty(monthlyStatusKey, JSON.stringify(monthlyStatus));
      }

    } catch (error) {
      Logger.log("Error in processMonthlyUserData: " + error.message);
      ErrorLogger.log("processMonthlyUserData Error", error.message + (error.stack ? "\n" + error.stack : ""));
    }
  }

  /**
   * 指定ユーザーの指定月のコメントを取得
   */
  static getUserCommentsForMonth(userId, processedMonthStr) {
    const sheet = MessageHistory.getMainSheet();
    const data = sheet.getDataRange().getValues();
    const userComments = [];

    const firstDayOfProcessedMonth = new Date(processedMonthStr + "-01T00:00:00");
    const tempDate = new Date(firstDayOfProcessedMonth);
    tempDate.setMonth(tempDate.getMonth() + 1);
    tempDate.setDate(0);
    const lastDayOfProcessedMonth = new Date(tempDate.getFullYear(), tempDate.getMonth(), tempDate.getDate(), 23, 59, 59);

    for (let i = 1; i < data.length; i++) {
      const timestamp = new Date(data[i][0]);
      const msgUserId = data[i][1];
      const message = data[i][2];

      if (msgUserId === userId && timestamp >= firstDayOfProcessedMonth && timestamp <= lastDayOfProcessedMonth) {
        userComments.push({
          timestamp: Config.formatDate(timestamp),
          message: message
        });
      }
    }

    return userComments;
  }

  /**
   * 月次レポート用のNotionブロックを生成
   */
  static generateMonthlyNotionBlocks(userComments) {
    const notionBlocks = [];

    // コメントを日付ごとにグループ化
    const commentsByDate = {};
    userComments.forEach(comment => {
      const dateStr = comment.timestamp.substring(0, 10); // "yyyy/MM/dd"
      if (!commentsByDate[dateStr]) {
        commentsByDate[dateStr] = [];
      }
      // コメントに時刻(HH:mm)を追加
      commentsByDate[dateStr].push(comment.message + "(" + comment.timestamp.substring(11, 16) + ")");
    });

    // 日付ごとにブロックを生成
    const sortedDates = Object.keys(commentsByDate).sort();

    sortedDates.forEach(date => {
      notionBlocks.push({
        object: "block",
        type: "heading_3",
        heading_3: {
          rich_text: [{ type: "text", text: { content: date } }]
        }
      });

      const messagesForDate = commentsByDate[date];
      messagesForDate.forEach(message => {
        notionBlocks.push({
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [{ type: "text", text: { content: message } }]
          }
        });
      });
    });

    // LINEリンクのフッターを追加
    notionBlocks.push({
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: [
          {
            type: "text",
            text: {
              content: "https://line.me/R/ti/p/@838dxysu",
              link: { url: "https://line.me/R/ti/p/@838dxysu" },
            },
          },
        ],
      },
    });

    return notionBlocks;
  }

  /**
   * 月次レポート用のNotionページを作成
   */
  static createMonthlyNotionPage(title, blocks, processedMonthStr, userName) {
    try {
      const databaseId = Config.getNotionDatabaseId();
      if (!databaseId) {
        Logger.log("NOTION_DATABASE_ID が設定されていません。");
        ErrorLogger.log("Notion Config Error", "NOTION_DATABASE_ID is not set for pushToNotionMonthly");
        return false;
      }

      const payload = {
        parent: { database_id: databaseId },
        properties: {
          title: {
            title: [{ text: { content: title } }]
          },
          ラベル: {
            select: { name: "ひと月のおきもち" }
          },
          URL: { url: null },
          "Liked User": { people: [] },
          作成者メモ: { 
            rich_text: [{ text: { content: processedMonthStr + " の " + userName + " のレポート" } }] 
          },
        },
        children: blocks
      };

      Logger.log("Notion API Payload: " + JSON.stringify(payload).substring(0, 500) + "...");

      const url = "https://api.notion.com/v1/pages";
      const response = this.sendRequestToNotion(url, "POST", payload);

      if (response.code === 200) {
        return true;
      } else {
        Logger.log("Notionページの作成に失敗しました. Code: " + response.code + ", Body: " + response.body);
        ErrorLogger.log("Notion API Error pushToNotionMonthly", "Code: " + response.code + ", Body: " + response.body);
        return false;
      }

    } catch (error) {
      Logger.log("Error in createMonthlyNotionPage: " + error.message);
      ErrorLogger.log("createMonthlyNotionPage Error", error.message);
      return false;
    }
  }

  /**
   * 前日の記事を最終更新
   */
  static finalizePreviousDayArticle(yesterday, allData) {
    try {
      // 日本時間での日付文字列を生成
      const yesterdayDateStr = Config.formatDate(yesterday, "yyyy-MM-dd");
      Logger.log("前日の記事最終更新を開始: " + yesterdayDateStr);
      
      // 前日の正確な時間範囲を設定
      const yesterdayStart = Config.getTodayStart(yesterday);
      const yesterdayEnd = Config.getTodayEnd(yesterday);
      
      // 前日のデータを抽出（前日の0時0分0秒から23時59分59秒まで）
      const yesterdayEntries = allData.slice(1).filter(row => {
        const ts = new Date(row[0]);
        return ts >= yesterdayStart && ts <= yesterdayEnd;
      });

      if (yesterdayEntries.length === 0) {
        Logger.log("前日のデータがないため、最終更新をスキップします。（対象期間: " + 
                   Config.formatDate(yesterdayStart) + 
                   " - " + 
                   Config.formatDate(yesterdayEnd) + "）");
        return;
      }
      
      Logger.log("前日のデータを " + yesterdayEntries.length + " 件取得しました。（対象期間: " + 
                 Config.formatDate(yesterdayStart) + 
                 " - " + 
                 Config.formatDate(yesterdayEnd) + "）");

      // 前日の記事を検索
      const yesterdayPageId = this.findSpecificDateNotionPage(yesterdayStart);
      if (!yesterdayPageId) {
        Logger.log("前日の記事が見つからないため、最終更新をスキップします。");
        return;
      }

      // ユーザーごとにグループ化
      const grouped = {};
      yesterdayEntries.forEach(row => {
        const userId = row[1];
        const userName = UserManager.getDisplayName(userId) || "誰か";
        const ts = Config.formatDate(new Date(row[0]), "HH:mm");
        const msg = row[2];
        const geminiMsg = row[3];

        const userMessageContent = "「" + msg + "」" + "(" + ts + ")";
        let omcchiMessageContent = null;
        if (geminiMsg) {
          omcchiMessageContent = "\"( ๑•ᴗ•๑)\" ＜ " + geminiMsg;
        }

        (grouped[userName] = grouped[userName] || []).push({
          user: userMessageContent,
          omochi: omcchiMessageContent,
        });
      });

      // 本文生成 (Geminiのタイトル生成用)
      const contentLinesForTitle = [];
      Object.keys(grouped).forEach(userName => {
        contentLinesForTitle.push(userName);
        grouped[userName].forEach(entry => {
          contentLinesForTitle.push(entry.user);
          if (entry.omochi) {
            contentLinesForTitle.push(entry.omochi);
          }
        });
        contentLinesForTitle.push("");
      });
      const contentForTitle = contentLinesForTitle.join("\n");

      // 最終的なタイトルを生成
      const prompt = "\n\nあなたはタイトル命名AIです。20文字以内で今日のパワーワードを１つピックアップして！(タイトルだけを返却して)";
      const finalTitle = GeminiAPI.getMessage(contentForTitle, prompt).slice(0, 20);
      const yesterdayFinalTitle = `${Config.formatDate(yesterdayStart, "yyyy-MM-dd")}` + " " + finalTitle;

      // Notionページ本文のブロックを生成
      const notionBlocks = this.generateNotionBlocks(grouped);

      // 前日の記事を最終更新
      this.updateNotionPage(yesterdayPageId, yesterdayFinalTitle, notionBlocks);
      Logger.log("前日の記事を最終更新しました: " + yesterdayPageId + ", タイトル: " + yesterdayFinalTitle);

    } catch (error) {
      Logger.log("Error in finalizePreviousDayArticle: " + error.message);
      ErrorLogger.log("finalizePreviousDayArticle Error", error.message + (error.stack ? "\n" + error.stack : ""));
    }
  }

  /**
   * 1時間ごとの更新処理
   */
  static processHourlyUpdate(todayEntries, existingPageId, todayStart, now) {
    try {
      // ユーザーごとにグループ化
      const grouped = {};
      todayEntries.forEach(row => {
        const userId = row[1];
        const userName = UserManager.getDisplayName(userId) || "誰か";
        const ts = Config.formatDate(new Date(row[0]), "HH:mm");
        const msg = row[2];
        const geminiMsg = row[3];

        const userMessageContent = "「" + msg + "」" + "(" + ts + ")";
        let omcchiMessageContent = null;
        if (geminiMsg) {
          omcchiMessageContent = "\"( ๑•ᴗ•๑)\" ＜ " + geminiMsg;
        }

        (grouped[userName] = grouped[userName] || []).push({
          user: userMessageContent,
          omochi: omcchiMessageContent,
        });
      });

      // 本文生成 (Geminiのタイトル生成用)
      const contentLinesForTitle = [];
      Object.keys(grouped).forEach(userName => {
        contentLinesForTitle.push(userName);
        grouped[userName].forEach(entry => {
          contentLinesForTitle.push(entry.user);
          if (entry.omochi) {
            contentLinesForTitle.push(entry.omochi);
          }
        });
        contentLinesForTitle.push("");
      });
      const contentForTitle = contentLinesForTitle.join("\n");

      // タイトルは新規投稿があるたびに毎回再生成
      const prompt = "\n\nあなたはタイトル命名AIです。20文字以内で今日のパワーワードを１つピックアップして！(タイトルだけを返却して)";
      const title = GeminiAPI.getMessage(contentForTitle, prompt).slice(0, 20);
      const todayTitle = `${Config.formatDate(now, "yyyy-MM-dd")}` + " " + title;

      // Notionページ本文のブロックを生成
      const notionBlocks = this.generateNotionBlocks(grouped);

      const databaseId = Config.getNotionDatabaseId();

      if (existingPageId) {
        // 既存のページを更新
        this.updateNotionPage(existingPageId, todayTitle, notionBlocks);
        Logger.log("今日のNotionページを更新しました: " + existingPageId);
      } else {
        // 新しいページを作成
        this.createNotionPage(databaseId, todayTitle, notionBlocks);
        Logger.log("今日のNotionページを新規作成しました");
      }
    } catch (error) {
      Logger.log("Error in processHourlyUpdate: " + error.message);
      ErrorLogger.log("processHourlyUpdate Error", error.message);
    }
  }

  /**
   * Notionブロックを生成
   */
  static generateNotionBlocks(grouped) {
    const notionBlocks = [];
    
    Object.keys(grouped).forEach(userName => {
      notionBlocks.push({
        object: "block",
        type: "heading_3",
        heading_3: {
          rich_text: [
            {
              type: "text",
              text: {
                content: userName,
              },
            },
          ],
        },
      });

      grouped[userName].forEach(entry => {
        notionBlocks.push({
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [{ type: "text", text: { content: entry.user } }],
          },
        });

        if (entry.omochi) {
          notionBlocks.push({
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: [{ type: "text", text: { content: "    " + entry.omochi } }],
            },
          });
        }
      });
    });

    // LINEリンクのフッターを追加
    notionBlocks.push({
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: [
          {
            type: "text",
            text: {
              content: "https://line.me/R/ti/p/@838dxysu",
              link: { url: "https://line.me/R/ti/p/@838dxysu" },
            },
          },
        ],
      },
    });

    return notionBlocks;
  }

  /**
   * 今日のNotionページを検索
   */
  static findTodayNotionPage(today) {
    try {
      const databaseId = Config.getNotionDatabaseId();
      // 日本時間での日付文字列を使用
      const todayStr = Config.formatDate(today, "yyyy-MM-dd");
      
      const searchPayload = {
        filter: {
          and: [
            {
              property: "title",
              title: {
                starts_with: todayStr
              }
            },
            {
              property: "ラベル",
              select: {
                equals: "今日のおきもち"
              }
            }
          ]
        }
      };

      const url = "https://api.notion.com/v1/databases/" + databaseId + "/query";
      const response = this.sendRequestToNotion(url, "POST", searchPayload);
      
      if (response.code === 200) {
        const responseData = JSON.parse(response.body);
        if (responseData.results && responseData.results.length > 0) {
          return responseData.results[0].id;
        }
      }
      return null;
    } catch (error) {
      Logger.log("Error in findTodayNotionPage: " + error.message);
      return null;
    }
  }

  /**
   * 特定日付のNotionページを検索
   */
  static findSpecificDateNotionPage(date) {
    try {
      const databaseId = Config.getNotionDatabaseId();
      // 日本時間での日付文字列を使用
      const dateStr = Config.formatDate(date, "yyyy-MM-dd");
      
      const searchPayload = {
        filter: {
          and: [
            {
              property: "title",
              title: {
                starts_with: dateStr
              }
            },
            {
              property: "ラベル",
              select: {
                equals: "今日のおきもち"
              }
            }
          ]
        }
      };

      const url = "https://api.notion.com/v1/databases/" + databaseId + "/query";
      const response = this.sendRequestToNotion(url, "POST", searchPayload);
      
      if (response.code === 200) {
        const responseData = JSON.parse(response.body);
        if (responseData.results && responseData.results.length > 0) {
          return responseData.results[0].id;
        }
      }
      return null;
    } catch (error) {
      Logger.log("Error in findSpecificDateNotionPage: " + error.message);
      return null;
    }
  }

  /**
   * NotionにHTTPリクエストを送信
   */
  static sendRequestToNotion(url, method, payload = null) {
    try {
      const token = Config.getNotionToken();
      const options = {
        method: method.toUpperCase(),
        headers: {
          "Authorization": "Bearer " + token,
          "Notion-Version": "2022-06-28",
          "Content-Type": "application/json",
        },
        muteHttpExceptions: true,
      };

      if (payload && (method.toUpperCase() === "POST" || method.toUpperCase() === "PATCH")) {
        options.payload = JSON.stringify(payload);
      }

      const response = UrlFetchApp.fetch(url, options);
      return {
        code: response.getResponseCode(),
        body: response.getContentText()
      };
    } catch (error) {
      Logger.log("Error in sendRequestToNotion: " + error.message);
      return {
        code: 500,
        body: "Request failed: " + error.message
      };
    }
  }

  /**
   * Notionページを更新
   */
  static updateNotionPage(pageId, title, blocks) {
    try {
      // ページのタイトルを更新
      const titleUpdateUrl = "https://api.notion.com/v1/pages/" + pageId;
      const titlePayload = {
        properties: {
          title: {
            title: [
              {
                text: {
                  content: title,
                },
              },
            ],
          },
        },
      };

      const titleResponse = this.sendRequestToNotion(titleUpdateUrl, "PATCH", titlePayload);
      if (titleResponse.code !== 200) {
        Logger.log("ページタイトル更新に失敗: " + titleResponse.code + " " + titleResponse.body);
        ErrorLogger.log("Notion Title Update Error", "Code: " + titleResponse.code + ", Body: " + titleResponse.body);
        return;
      }

      // 既存のコンテンツを削除してから新しいコンテンツを追加
      this.replacePageContent(pageId, blocks);

    } catch (error) {
      Logger.log("Error in updateNotionPage: " + error.message);
      ErrorLogger.log("updateNotionPage Error", error.message);
    }
  }

  /**
   * Notionページのコンテンツを置き換え
   */
  static replacePageContent(pageId, newBlocks) {
    try {
      // 既存のブロックを取得
      const getBlocksUrl = "https://api.notion.com/v1/blocks/" + pageId + "/children";
      const getResponse = this.sendRequestToNotion(getBlocksUrl, "GET");
      
      if (getResponse.code === 200) {
        const responseData = JSON.parse(getResponse.body);
        
        // 既存のブロックを削除
        if (responseData.results && responseData.results.length > 0) {
          responseData.results.forEach(block => {
            const deleteUrl = "https://api.notion.com/v1/blocks/" + block.id;
            this.sendRequestToNotion(deleteUrl, "DELETE");
          });
        }
      }

      // 新しいブロックを追加
      const addBlocksUrl = "https://api.notion.com/v1/blocks/" + pageId + "/children";
      const addPayload = {
        children: newBlocks
      };

      const addResponse = this.sendRequestToNotion(addBlocksUrl, "PATCH", addPayload);
      if (addResponse.code !== 200) {
        Logger.log("ブロック追加に失敗: " + addResponse.code + " " + addResponse.body);
        ErrorLogger.log("Notion Block Add Error", "Code: " + addResponse.code + ", Body: " + addResponse.body);
      }

    } catch (error) {
      Logger.log("Error in replacePageContent: " + error.message);
      ErrorLogger.log("replacePageContent Error", error.message);
    }
  }

  /**
   * 新しいNotionページを作成
   */
  static createNotionPage(databaseId, title, blocks) {
    try {
      const payload = {
        parent: { database_id: databaseId },
        properties: {
          title: {
            title: [
              {
                text: {
                  content: title,
                },
              },
            ],
          },
          ラベル: {
            select: { name: "今日のおきもち" },
          },
          URL: {
            url: null,
          },
          "Liked User": {
            people: [],
          },
          作成者メモ: {
            rich_text: [{ text: { content: "" } }],
          },
        },
        children: blocks,
      };

      const url = "https://api.notion.com/v1/pages";
      const response = this.sendRequestToNotion(url, "POST", payload);

      if (response.code !== 200) {
        Logger.log("ページ作成に失敗: " + response.code + " " + response.body);
        ErrorLogger.log("Notion Page Create Error", "Code: " + response.code + ", Body: " + response.body);
        throw new Error("Notion API Error " + response.code + ": " + response.body);
      }

      return JSON.parse(response.body).id;
    } catch (error) {
      Logger.log("Error in createNotionPage: " + error.message);
      ErrorLogger.log("createNotionPage Error", error.message);
      throw error;
    }
  }

  /**
   * ページの最終更新時刻を取得
   */
  static getPageLastModified(pageId) {
    try {
      const url = "https://api.notion.com/v1/pages/" + pageId;
      const response = this.sendRequestToNotion(url, "GET");
      
      if (response.code === 200) {
        const data = JSON.parse(response.body);
        
        if (data.last_edited_time) {
          const lastEditedTime = new Date(data.last_edited_time);
          Logger.log("ページの最終更新時刻: " + Config.formatDate(lastEditedTime));
          return lastEditedTime;
        }
      } else {
        Logger.log("ページ情報の取得に失敗しました: " + response.code + " " + response.body);
      }
      
      return null;
    } catch (error) {
      Logger.log("ページの最終更新時刻取得でエラーが発生しました: " + error.toString());
      ErrorLogger.log("getPageLastModified Error", error.message);
      return null;
    }
  }
}
