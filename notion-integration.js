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
      const now = new Date();
      // 今日の0時0分0秒を明確に設定（日付境界を明確に）
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      
      // 昨日の日付を計算
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const yesterdayStart = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 0, 0, 0, 0);
      const yesterdayEnd = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59, 999);
      
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
                   Utilities.formatDate(todayStart, "Asia/Tokyo", "yyyy/MM/dd HH:mm:ss") + 
                   " - " + 
                   Utilities.formatDate(now, "Asia/Tokyo", "yyyy/MM/dd HH:mm:ss") + "）");
        return;
      }
      
      Logger.log("今日のデータを " + todayEntries.length + " 件取得しました。（対象期間: " + 
                 Utilities.formatDate(todayStart, "Asia/Tokyo", "yyyy/MM/dd HH:mm:ss") + 
                 " - " + 
                 Utilities.formatDate(now, "Asia/Tokyo", "yyyy/MM/dd HH:mm:ss") + "）");

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
            return new Date(row[0]) > lastUpdateTime;
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
   * 前日の記事を最終更新
   */
  static finalizePreviousDayArticle(yesterday, allData) {
    try {
      Logger.log("前日の記事最終更新を開始: " + yesterday.toISOString().slice(0, 10));
      
      // 前日の正確な時間範囲を設定
      const yesterdayStart = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 0, 0, 0, 0);
      const yesterdayEnd = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59, 999);
      
      // 前日のデータを抽出（前日の0時0分0秒から23時59分59秒まで）
      const yesterdayEntries = allData.slice(1).filter(row => {
        const ts = new Date(row[0]);
        return ts >= yesterdayStart && ts <= yesterdayEnd;
      });

      if (yesterdayEntries.length === 0) {
        Logger.log("前日のデータがないため、最終更新をスキップします。（対象期間: " + 
                   Utilities.formatDate(yesterdayStart, "Asia/Tokyo", "yyyy/MM/dd HH:mm:ss") + 
                   " - " + 
                   Utilities.formatDate(yesterdayEnd, "Asia/Tokyo", "yyyy/MM/dd HH:mm:ss") + "）");
        return;
      }
      
      Logger.log("前日のデータを " + yesterdayEntries.length + " 件取得しました。（対象期間: " + 
                 Utilities.formatDate(yesterdayStart, "Asia/Tokyo", "yyyy/MM/dd HH:mm:ss") + 
                 " - " + 
                 Utilities.formatDate(yesterdayEnd, "Asia/Tokyo", "yyyy/MM/dd HH:mm:ss") + "）");

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
        const userName = MessageHistory.getDisplayName(userId) || "誰か";
        const ts = Utilities.formatDate(
          new Date(row[0]),
          Session.getScriptTimeZone(),
          "HH:mm"
        );
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
      const yesterdayFinalTitle = `${yesterdayStart.toISOString().slice(0, 10)}` + " " + finalTitle;

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
        const userName = MessageHistory.getDisplayName(userId) || "誰か";
        const ts = Utilities.formatDate(
          new Date(row[0]),
          Session.getScriptTimeZone(),
          "HH:mm"
        );
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
      const todayTitle = `${now.toISOString().slice(0, 10)}` + " " + title;

      // Notionページ本文のブロックを生成
      const notionBlocks = this.generateNotionBlocks(grouped);

      const databaseId = Config.getProperty("NOTION_DATABASE_ID");

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
      const databaseId = Config.getProperty("NOTION_DATABASE_ID");
      const todayStr = today.toISOString().slice(0, 10);
      
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
      const databaseId = Config.getProperty("NOTION_DATABASE_ID");
      const dateStr = date.toISOString().slice(0, 10);
      
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
   * 日次の一括連携（後方互換性のため残す）
   */
  static pushToNotionDaily() {
    Logger.log("Daily push is deprecated. Use pushToNotionHourly instead.");
    this.pushToNotionHourly();
  }

  /**
   * NotionにHTTPリクエストを送信
   */
  static sendRequestToNotion(url, method, payload = null) {
    try {
      const token = Config.getProperty("NOTION_TOKEN");
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
          Logger.log("ページの最終更新時刻: " + Utilities.formatDate(lastEditedTime, "Asia/Tokyo", "yyyy/MM/dd HH:mm:ss"));
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
