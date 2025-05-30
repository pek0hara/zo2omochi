function doPost(e) {
  try {
    var contents = JSON.parse(e.postData.contents);
    var event = contents.events[0];

    // webhookEventIdによる重複チェック（最も確実な方法）
    if (event.webhookEventId) {
      if (isDuplicateEvent(event.webhookEventId)) {
        Logger.log("Duplicate webhookEventId detected: " + event.webhookEventId);
        return ContentService.createTextOutput(
          JSON.stringify({
            result: "success",
            message: "Duplicate event skipped",
          })
        ).setMimeType(ContentService.MimeType.JSON);
      }
      // 処理したイベントIDを記録
      recordProcessedEvent(event.webhookEventId);
    }

    // 再配信イベントのチェック
    if (event.deliveryContext && event.deliveryContext.isRedelivery) {
      logErrorToSheet(
        "再配信イベントを受信しました。 WebhookEventID: " +
          (event.webhookEventId || "N/A") + // WebhookEventIdがあればログに出力
          ", UserID: " +
          (event.source ? event.source.userId : "N/A") +
          "。重複処理を避けるためスキップします。"
      );
      // LINEに即座に応答を返し、さらなる再試行を防ぎます。
      return ContentService.createTextOutput(
        JSON.stringify({
          result: "success",
          message: "再配信イベントを受信し、スキップしました。",
        })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    var userId = event.source.userId;
    var botUserId = PropertiesService.getScriptProperties().getProperty("BOT_USER_ID"); // BotのユーザーIDを取得

    // postbackの「はい」を受け取ったときの処理
    if (
      event.type === "postback" &&
      event.postback.data.startsWith("confirm_name_yes:")
    ) {
      // postbackからユーザーが入力した名前を取得
      var proposedName = event.postback.data.replace("confirm_name_yes:", "");

      // 名前を保存
      setUserName(userId, proposedName);
      // 使い方を返信
      sendUsageGuide(event.replyToken, getDisplayName(userId));
      return ContentService.createTextOutput(
        JSON.stringify({ result: "success" }),
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // postbackの「いいえ」を受け取ったときの処理
    if (
      event.type === "postback" &&
      event.postback.data === "confirm_name_no"
    ) {
      askForNameAgain(event.replyToken);
      return ContentService.createTextOutput(
        JSON.stringify({ result: "success" }),
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // 友達追加（follow）時の挨拶
    if (event.type === "follow") {
      sendWelcomeMessage(event.replyToken);
      return ContentService.createTextOutput(
        JSON.stringify({ result: "success" }),
      ).setMimeType(ContentService.MimeType.JSON);
    }

    if (
      event.type === "message" &&
      event.message.type === "text"
    ) {
      var isMentionedToBot = false;
      if (event.source.type === "group") {
        isMentionedToBot = event.message.mention &&
                           event.message.mention.mentionees &&
                           event.message.mention.mentionees.some(m => m.userId === botUserId);
        if (!isMentionedToBot) {
          // Botへのメンションがないグループメッセージは無視
          return ContentService.createTextOutput(
            JSON.stringify({ result: "success", message: "Not mentioned to bot" })
          ).setMimeType(ContentService.MimeType.JSON);
        }
      }

      // ユーザーからのメッセージ、またはグループでBotにメンションがあった場合のみ処理を続行
      if (event.source.type === "user" || (event.source.type === "group" && isMentionedToBot)) {
        var messageText = event.message.text;
        // グループチャットの場合、メンション部分をメッセージテキストから削除する
        if (event.source.type === "group" && botUserId) {
            if (event.message.mention && event.message.mention.mentionees && event.message.mention.mentionees.length > 0) {
                let textParts = [];
                let lastIndex = 0;
                // メンション情報をindexでソート
                const sortedMentions = event.message.mention.mentionees.slice().sort((a, b) => a.index - b.index);

                sortedMentions.forEach(mention => {
                    if (mention.userId === botUserId) {
                        // Botへのメンションの前の部分を追加
                        if (mention.index > lastIndex) {
                            textParts.push(event.message.text.substring(lastIndex, mention.index));
                        }
                        // メンション部分をスキップしてlastIndexを更新
                        lastIndex = mention.index + mention.length;
                    }
                });
                // 最後のメンションの後の部分を追加
                if (lastIndex < event.message.text.length) {
                    textParts.push(event.message.text.substring(lastIndex));
                }
                
                // Botへのメンションが一つでもあった場合、textPartsを結合してmessageTextとする
                // Botへのメンションが全く無かった場合は、元のmessageTextをそのまま使う (isMentionedToBotの条件があるので基本的にはBotメンションはあるはずだが念のため)
                if (event.message.mention.mentionees.some(m => m.userId === botUserId)) {
                    messageText = textParts.join('').trim();
                } else {
                    // このケースは isMentionedToBot が true であれば通常発生しないはず
                    // isMentionedToBot のロジックが mentionees の userId のみを見ているため、
                    // text プロパティに @ユーザー名 があっても mentionees が空の場合 isMentionedToBot は false になる。
                    // よって、ここに来る場合は botUserId を含む mention が存在しているはず。
                    messageText = event.message.text.trim(); // フォールバックとして元のテキスト（からBot名を手動で消す必要があるかもしれない）
                }

                // もし上記の処理でmessageTextが空になった場合（例：メンションのみのメッセージ）、
                // それでも記録や返信処理は続行される。
            }
        }


        var userName = getDisplayName(userId); // メッセージ送信者のuserIdを使用

        if (messageText.startsWith("/welcome")) {
          sendWelcomeMessage(event.replyToken);
          return ContentService.createTextOutput(
            JSON.stringify({ result: "success" }),
          ).setMimeType(ContentService.MimeType.JSON);
        }

        // 名前が未設定の場合
        if (!userName || userName === "") {
          // 名前の確認を促すメッセージを送信
          sendReply(event.replyToken, "あなたの名前を教えて！");
          // 名前に「誰か」を設定
          setUserName(userId, "誰か");

          return ContentService.createTextOutput(
            JSON.stringify({ result: "success" }),
          ).setMimeType(ContentService.MimeType.JSON);
        }

        // 名前が未設定の場合
        if (userName === "誰か") {
          // ユーザーが入力したテキストを名前候補とする
          var proposedName = messageText.trim();
          if (proposedName && proposedName.length > 0) {
            // 空文字でないことを確認
            // 名前確認メッセージを送信
            askForNameConfirmation(event.replyToken, proposedName);
          } else {
            // 名前として無効な入力の場合、再度入力を促す
            sendReply(event.replyToken, "あなたの名前を教えてください。");
          }
          return ContentService.createTextOutput(
            JSON.stringify({ result: "success" }),
          ).setMimeType(ContentService.MimeType.JSON);
        }

        // 名前を設定するコマンド
        if (messageText.startsWith("/setname ")) {
          var newName = messageText.replace("/setname ", "").trim();
          if (newName) {
            setUserName(userId, newName);
            sendReply(
              event.replyToken,
              "名前を「" + newName + "」に設定したよ！",
            );
          } else {
            sendReply(
              event.replyToken,
              "名前を設定できませんでした。正しい形式で入力してください。",
            );
          }
          return ContentService.createTextOutput(
            JSON.stringify({ result: "success" }),
          ).setMimeType(ContentService.MimeType.JSON);
        }

        // 削除コマンド
        if (messageText.startsWith("/delete")) {
          handleDeleteCommand(userId, messageText, event.replyToken);
          return ContentService.createTextOutput(
            JSON.stringify({ result: "success" }),
          ).setMimeType(ContentService.MimeType.JSON);
        }

        // 使い方ガイド表示: 「使い方」または「つかいかた」から始まるメッセージ
        if (
          messageText.startsWith("使い方") ||
          messageText.startsWith("つかいかた") ||
          messageText === "ヘルプ" ||
          messageText === "へるぷ"
        ) {
          sendUsageGuide(event.replyToken, userName);
          return ContentService.createTextOutput(
            JSON.stringify({ result: "success" }),
          ).setMimeType(ContentService.MimeType.JSON);
        }

        // 通常の処理: getTodaysMessages を呼び出して、今日のメッセージを取得
        var todaysMessages = [];
        if (event.source.type === "user") {
          todaysMessages = getTodaysMessages(userId);
        }
        var prompt = "\n\nあなたはLINEBOTです。上記の発言に1行でかわいくツッコんでください！";
        var geminiMessage = getGeminiMessage(messageText, prompt);
        const replyMessage = [
          geminiMessage + "\n",
          ...todaysMessages,
          `${Utilities.formatDate(new Date(), "Asia/Tokyo", "HH:mm")} ${messageText}`
        ].join("\n");

        // 返信メッセージを送信
        sendReply(event.replyToken, replyMessage);

        // 現在のつぶやきをスプレッドシートに保存
        logToMainSheet(userId, messageText, geminiMessage);

        return ContentService.createTextOutput(
          JSON.stringify({ result: "success" }),
        ).setMimeType(ContentService.MimeType.JSON);
      }
    }
  } catch (error) {
    Logger.log("Error in doPost: " + error.message);
    logErrorToSheet(error.message, error.stack); // エラーをスプレッドシートに記録
    return ContentService.createTextOutput(
      JSON.stringify({ result: "error", message: error.message }),
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

// 名前確認メッセージを送信する関数
function askForNameConfirmation(replyToken, proposedName) {
  var url = "https://api.line.me/v2/bot/message/reply";
  var token = PropertiesService.getScriptProperties().getProperty(
    "LINE_CHANNEL_ACCESS_TOKEN",
  );

  var payload = {
    replyToken: replyToken,
    messages: [
      {
        type: "template",
        altText: "名前の確認",
        template: {
          type: "buttons",
          text: "あなたの名前は「" + proposedName + "」でよいですか？",
          actions: [
            {
              type: "postback",
              label: "はい",
              data: "confirm_name_yes:" + proposedName, // postbackデータに名前を含める
              displayText: "はい",
            },
            {
              type: "postback",
              label: "いいえ",
              data: "confirm_name_no",
              displayText: "いいえ",
            },
          ],
        },
      },
    ],
  };

  var options = {
    method: "post",
    contentType: "application/json",
    headers: {
      Authorization: "Bearer " + token,
    },
    payload: JSON.stringify(payload),
  };

  try {
    UrlFetchApp.fetch(url, options);
  } catch (error) {
    Logger.log("Error in askForNameConfirmation: " + error.message);
    logErrorToSheet("askForNameConfirmation Error", error.message); // エラーログ
  }
}

// 名前再入力を促すメッセージを送信する関数
function askForNameAgain(replyToken) {
  sendReply(replyToken, "あなたの名前を教えて！");
}

// 使い方ガイドを送信する関数
function sendUsageGuide(replyToken, userName) {
  var url = "https://api.line.me/v2/bot/message/reply";
  var token = PropertiesService.getScriptProperties().getProperty(
    "LINE_CHANNEL_ACCESS_TOKEN",
  );
  var intro =
    "👋 おもちだよ！\n" +
    userName +
    "、まったりしていってね！\n" +
    "あなたのつぶやきを記録するよ。\n\n";
  var guide =
    "📖 使い方ガイド 📖\n" +
    "• 基本的にはただつぶやくだけ\n" +
    "• 「/setname あなたの名前」名前を設定し直せるよ\n" +
    "• 「/delete」直前のつぶやきを削除できるよ\n" +
    "• 「/delete hh:mm (例: /delete 10:30)」時間指定で削除できるよ\n";

  // 返答候補リスト
  var responses = [
    "ひらめいた",
    "ワクワクしてきた",
    "イメージ通り",
    "もう探検に出られそう",
    "想定の範囲内",
    "おいしそう…",
    "お前の気持ちもわかる",
    "完全に理解した",
    "未来を感じる！",
    "わがままも聞いてくれ",
  ];
  // シャッフルして3つ取得
  var choices = responses.sort(() => Math.random() - 0.5).slice(0, 3);
  var actions = choices.map(function (text) {
    return { type: "message", label: text, text: text };
  });

  var payload = {
    replyToken: replyToken,
    messages: [
      { type: "text", text: intro + guide },
      {
        type: "template",
        altText: "どんなかんじ？",
        template: {
          type: "buttons",
          text: "どんなかんじ？",
          actions: actions,
        },
      },
    ],
  };
  var options = {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + token },
    payload: JSON.stringify(payload),
  };
  try {
    UrlFetchApp.fetch(url, options);
  } catch (e) {
    Logger.log("Error in sendUsageGuide: " + e.message);
    logErrorToSheet("sendUsageGuide Error", e.message);
  }
}

// 友達追加時の挨拶テンプレートを送信する関数
function sendWelcomeMessage(replyToken) {
  var url = "https://api.line.me/v2/bot/message/reply";
  var token = PropertiesService.getScriptProperties().getProperty(
    "LINE_CHANNEL_ACCESS_TOKEN",
  );
  var payload = {
    replyToken: replyToken,
    messages: [
      {
        type: "template",
        altText: "おもちだよ、よろしくな",
        template: {
          type: "buttons",
          text: "おもちだよ、よろしくな",
          actions: [
            {
              type: "message",
              label: "よろしく",
              text: "よろしく",
            },
          ],
        },
      },
    ],
  };
  var options = {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + token },
    payload: JSON.stringify(payload),
  };
  try {
    UrlFetchApp.fetch(url, options);
  } catch (error) {
    Logger.log("Error in sendWelcomeMessage: " + error.message);
    logErrorToSheet("sendWelcomeMessage Error", error.message);
  }
}

// ユーザーIDと名前を紐づける
function getDisplayName(userId) {
  var userMap = PropertiesService.getScriptProperties().getProperty("USER_MAP");
  userMap = userMap ? JSON.parse(userMap) : {};

  // ユーザーが設定した名前を取得
  var userName = userMap[userId];

  return userName; // 設定された名前を返す
}

// LINE Messaging API を使って返信を送信する関数
function sendReply(replyToken, replyMessage) {
  var url = "https://api.line.me/v2/bot/message/reply";
  var token = PropertiesService.getScriptProperties().getProperty(
    "LINE_CHANNEL_ACCESS_TOKEN",
  ); // アクセストークンをスクリプトプロパティから取得

  var payload = {
    replyToken: replyToken,
    messages: [
      {
        type: "text",
        text: replyMessage,
      },
    ],
  };

  var options = {
    method: "post",
    contentType: "application/json",
    headers: {
      Authorization: "Bearer " + token,
    },
    payload: JSON.stringify(payload),
  };

  try {
    var response = UrlFetchApp.fetch(url, options);
    var responseCode = response.getResponseCode();
    var responseText = response.getContentText();

    // レスポンスコードをログに記録
    Logger.log("Response Code: " + responseCode);
    Logger.log("Response Text: " + responseText);
  } catch (error) {
    Logger.log("Error in sendReply: " + error.message);

    // スプレッドシートにエラーログを記録 (必要に応じて)
    logErrorToSheet("sendReply Error", error.message); // エラーログ
  }
}

function logToMainSheet(userId, messageText, geminiMessage) {
  var sheet = SpreadsheetApp.openById(
    PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID"),
  ).getSheetByName("おもちログ");
  if (!sheet) {
    sheet = SpreadsheetApp.openById(
      PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID"),
    ).insertSheet("おもちログ");
    sheet.appendRow(["日時", "ユーザーID", "本文", "おもちメッセージ"]);
  }
  var date = new Date();
  sheet.appendRow([date, userId, messageText, geminiMessage]);
}

// エラーをスプレッドシートの "error" シートに記録する関数
function logErrorToSheet(errorMessage, stackTrace) {
  var spreadsheet = SpreadsheetApp.openById(
    PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID"),
  );
  var sheet = spreadsheet.getSheetByName("error");
  if (!sheet) {
    sheet = spreadsheet.insertSheet("error");
    sheet.appendRow(["日時", "エラーメッセージ", "スタックトレース"]);
  }
  var date = new Date();
  sheet.appendRow([date, errorMessage, stackTrace]);
}

// エラーをスプレッドシートの "debug" シートに記録する関数
function logDebugToSheet(debugLog) {
  var spreadsheet = SpreadsheetApp.openById(
    PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID"),
  );
  var sheet = spreadsheet.getSheetByName("debug");
  if (!sheet) {
    sheet = spreadsheet.insertSheet("debug");
    sheet.appendRow(["日時", "デバッグログ"]);
  }
  var date = new Date();
  sheet.appendRow([date, debugLog]);
}

function setUserName(userId, newName) {
  var userMap = PropertiesService.getScriptProperties().getProperty("USER_MAP");
  userMap = userMap ? JSON.parse(userMap) : {};

  // 名前を保存
  userMap[userId] = newName;
  PropertiesService.getScriptProperties().setProperty(
    "USER_MAP",
    JSON.stringify(userMap),
  );
}

function getTodaysMessages(userId) {
  var sheet = SpreadsheetApp.openById(
    PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID"),
  ).getSheetByName("おもちログ");
  if (!sheet) return [];

  var data = sheet.getDataRange().getValues();
  var today = new Date();
  today.setHours(0, 0, 0, 0); // 今日の日付の0時0分0秒を設定

  var todaysMessages = [];
  for (var i = data.length - 1; i > 0; i--) {
    // 最新の行から取得
    var timestamp = new Date(data[i][0]); // 日時列
    var messageUserId = data[i][1]; // ユーザーID列
    var message = data[i][2]; // メッセージ列

    // 自分の書き込みかつ今日の日付のものを取得
    if (timestamp < today) {
      // 今日の日付より前になったらループを抜ける
      break;
    }

    if (messageUserId === userId && timestamp >= today) {
      var time = Utilities.formatDate(
        timestamp,
        Session.getScriptTimeZone(),
        "HH:mm",
      );
      todaysMessages.push(time + " " + message); // 時刻とメッセージを結合
    }
  }

  return todaysMessages.reverse(); // 配列を逆順にして返す
}

// 削除コマンドを処理する関数
function handleDeleteCommand(userId, messageText, replyToken) {
  var parts = messageText.trim().split(" ");
  if (parts.length === 1 && parts[0] === "/delete") {
    // 直前の書き込みを削除
    deleteLastMessage(userId, replyToken);
  } else if (parts.length === 2 && parts[0] === "/delete") {
    // 指定時間の書き込みを削除
    var timeString = parts[1];
    // hh:mm 形式か簡単なチェック
    if (/^\d{1,2}:\d{2}$/.test(timeString)) {
      deleteMessageByTime(userId, timeString, replyToken);
    } else {
      sendReply(
        replyToken,
        "時間の形式が正しくありません。hh:mm形式で指定してください。\n例: /delete 10:30",
      );
    }
  } else {
    sendReply(
      replyToken,
      "コマンドの形式が正しくありません。\n直前の削除: /delete\n時間指定削除: /delete hh:mm",
    );
  }
}

// 直前の書き込みを削除する関数
function deleteLastMessage(userId, replyToken) {
  var spreadsheetId =
    PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  var mainSheetName = "おもちログ";
  var deleted = false;
  var deletedMessage = "";

  // メインログシートから削除
  var mainSheet =
    SpreadsheetApp.openById(spreadsheetId).getSheetByName(mainSheetName);
  if (mainSheet) {
    var mainData = mainSheet.getDataRange().getValues();
    for (var i = mainData.length - 1; i > 0; i--) {
      // ヘッダー行を除き、最新から検索
      if (mainData[i][1] === userId) {
        // ユーザーIDが一致
        deletedMessage = mainData[i][2]; // 削除するメッセージを取得
        mainSheet.deleteRow(i + 1); // 行削除 (インデックス+1が行番号)
        deleted = true;
        break; // 最新の1件のみ削除
      }
    }
  }

  if (deleted) {
    sendReply(
      replyToken,
      "直前のつぶやき「" + deletedMessage + "」を削除したよ！",
    );
  } else {
    sendReply(replyToken, "削除できるあなたのつぶやきが見つかりませんでした。");
  }
}

// 指定時間の書き込みを削除する関数
function deleteMessageByTime(userId, timeString, replyToken) {
  var spreadsheetId =
    PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  var mainSheetName = "おもちログ";
  var deleted = false;
  var deletedMessage = "";
  var targetTime = timeString; // hh:mm 形式

  var today = new Date();
  today.setHours(0, 0, 0, 0); // 今日の日付の0時0分0秒

  // メインログシートから削除
  var mainSheet =
    SpreadsheetApp.openById(spreadsheetId).getSheetByName(mainSheetName);
  if (mainSheet) {
    var mainData = mainSheet.getDataRange().getValues();
    var rowsToDelete = []; // 削除対象の行インデックスを保存
    for (var i = mainData.length - 1; i > 0; i--) {
      // ヘッダー行を除き、最新から検索
      var timestamp = new Date(mainData[i][0]);
      var messageUserId = mainData[i][1];
      var messageTime = Utilities.formatDate(
        timestamp,
        Session.getScriptTimeZone(),
        "HH:mm",
      );

      // ユーザーIDが一致、今日の日付、指定時刻が一致
      if (
        messageUserId === userId &&
        timestamp >= today &&
        messageTime === targetTime
      ) {
        deletedMessage = mainData[i][2]; // 削除するメッセージを取得
        rowsToDelete.push(i + 1); // 行番号を保存
        deleted = true;
        // 同じ時間の投稿が複数ある可能性を考慮し、ここでは break しない
      }
    }
    // 削除対象行を後ろから削除 (行がずれるのを防ぐため)
    rowsToDelete
      .sort((a, b) => b - a)
      .forEach((rowIndex) => {
        mainSheet.deleteRow(rowIndex);
      });
  }

  if (deleted) {
    sendReply(
      replyToken,
      targetTime + " のつぶやき「" + deletedMessage + "」を削除しました。",
    );
  } else {
    sendReply(
      replyToken,
      "指定された時間(" +
        targetTime +
        ")のあなたのつぶやきが見つかりませんでした。",
    );
  }
}

// Gemini APIからメッセージを取得する関数
function getGeminiMessage(messageText, prompt) {
  var apiKey = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");
  if (!apiKey) {
    Logger.log("GEMINI_API_KEY is not set.");
    return "Gemini APIキーが設定されていません。"; // または適切なエラーメッセージ
  }

  // APIエンドポイントのURL
  var apiUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=" + apiKey;
  
  // リクエストボディの設定
  var payload = {
    contents: [{
      role: "user",
      parts: [{ text: messageText + prompt }]
    }]
  };

  var options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true, // エラーレスポンスも取得するため
  };

  try {
    var response = UrlFetchApp.fetch(apiUrl, options);
    var responseCode = response.getResponseCode();
    var responseBody = response.getContentText();

    if (responseCode === 200) {
      var jsonResponse = JSON.parse(responseBody);

      // レスポンスの形式を確認
      if (jsonResponse.candidates && jsonResponse.candidates.length > 0 &&
          jsonResponse.candidates[0].content && jsonResponse.candidates[0].content.parts &&
          jsonResponse.candidates[0].content.parts.length > 0) {
        return jsonResponse.candidates[0].content.parts[0].text;
      } else {
        Logger.log("Gemini API response format is unexpected: " + responseBody);
        return "Geminiからの応答を解析できませんでした。";
      }
    } else {
      Logger.log("Error calling Gemini API: " + responseCode + " - " + responseBody);
      logErrorToSheet("Gemini API Error", "Code: " + responseCode + ", Body: " + responseBody);
      return "Gemini APIの呼び出しに失敗しました。";
    }
  } catch (error) {
    Logger.log("Exception calling Gemini API: " + error.message);
    logErrorToSheet("Gemini API Exception", error.message + (error.stack ? "\\n" + error.stack : ""));
    return "Gemini APIの呼び出し中に例外が発生しました。";
  }
}

// 直近24時間分をまとめて Notion に連携する
function pushToNotionDaily() {
  var now = new Date();
  var yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  var sheet = SpreadsheetApp.openById(
    PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID"),
  ).getSheetByName("おもちログ");
  if (!sheet) return;

  var data = sheet.getDataRange().getValues();

  // 24時間内の行だけ抽出
  var recent = data.slice(1).filter(function (row) {
    var ts = new Date(row[0]);
    return ts >= yesterday && ts <= now;
  });

  // ユーザーごとにグループ化
  var grouped = {};
  recent.forEach(function (row) {
    var userId = row[1];
    var userName = getDisplayName(userId) || "誰か";
    var ts = Utilities.formatDate(
      new Date(row[0]),
      Session.getScriptTimeZone(),
      "HH:mm",
    );
    var msg = row[2];
    var geminiMsg = row[3];

    // ユーザーメッセージと「おもちメッセージ」を分けて格納
    var userMessageContent = "「" + msg + "」" + "(" + ts + ")";
    var omcchiMessageContent = null;
    if (geminiMsg) {
      omcchiMessageContent = "\"( ๑•ᴗ•๑)\" ＜ " + geminiMsg;
    }

    (grouped[userName] = grouped[userName] || []).push({
      user: userMessageContent,
      omochi: omcchiMessageContent,
    });
  });

  // 本文生成 (Geminiのタイトル生成用)
  var contentLinesForTitle = [];
  Object.keys(grouped).forEach(function (userName) {
    contentLinesForTitle.push(userName);
    grouped[userName].forEach(function(entry) {
      contentLinesForTitle.push(entry.user);
      if (entry.omochi) {
        contentLinesForTitle.push(entry.omochi);
      }
    });
    contentLinesForTitle.push("");
  });
  var contentForTitle = contentLinesForTitle.join("\n");

  var notionToken =
    PropertiesService.getScriptProperties().getProperty("NOTION_TOKEN");
  var databaseId =
    PropertiesService.getScriptProperties().getProperty("NOTION_DATABASE_ID");
  var prompt = "\n\nあなたはタイトル命名AIです。20文字以内で今日のパワーワードを１つピックアップして！(タイトルだけを返却して)";
  var title = getGeminiMessage(contentForTitle, prompt).slice(0, 20);

  // Notionページ本文のブロックを生成
  var notionBlocks = [];
  Object.keys(grouped).forEach(function (userName) {
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

    grouped[userName].forEach(function (entry) {
      // ユーザーメッセージを段落ブロックとして追加
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

  // payload 定義
  const payload = {
    parent: { database_id: databaseId },
    properties: {
      title: {
        // データベースのタイトルプロパティ名
        title: [
          {
            text: {
              content: `${now.toISOString().slice(0, 10)}` + " " + title,
            },
          },
        ],
      },
      ラベル: {
        // データベースのセレクトプロパティ名
        select: { name: "今日のおきもち" },
      },
      URL: {
        // データベースのURLプロパティ名
        url: null, // 空の場合は `null` を設定
      },
      "Liked User": {
        // データベースの People プロパティ名
        people: [], // 空の配列を設定
      },
      作成者メモ: {
        // データベースのリッチテキストプロパティ名
        rich_text: [{ text: { content: "" } }],
      },
    },
    children: [
      ...notionBlocks, // 生成したユーザーごとのブロックを展開
      // 既存の固定フッターブロック (LINEへのリンク)
      {
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
      },
    ],
  };

  Logger.log("Notion Database ID: " + databaseId);
  var url = "https://api.notion.com/v1/pages";
  var notionResponse = sendRequestToNotion(url, "post", payload);

  Logger.log("pushToNotionDaily response code: " + notionResponse.code);
  Logger.log("pushToNotionDaily response body: " + notionResponse.body);
  if (notionResponse.code !== 200) {
    logErrorToSheet("Notion API Error pushToNotionDaily", "Code: " + notionResponse.code + ", Body: " + notionResponse.body);
    throw new Error("Notion API Error " + notionResponse.code + ": " + notionResponse.body);
  }
}

// --- ここから月次Notion連携処理 ---

// 実行日基準で「前月」の年月 (YYYY-MM形式) を返す関数
function getProcessedMonth() {
  var now = new Date();
  now.setDate(0); // 前月の末日に設定
  return Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM");
}

// 年月を元に ScriptProperties で使用するキー名 (MONTHLY_EXPORT_STATUS_YYYY-MM) を生成する関数
function getMonthlyStatusKey(yyyymm) {
  return "MONTHLY_EXPORT_STATUS_" + yyyymm;
}

// 現在処理中のキーより古い月次ステータスキーを ScriptProperties から削除する関数
function deleteOldMonthlyStatusKeys(currentProcessingMonthKey) {
  var properties = PropertiesService.getScriptProperties();
  var allKeys = properties.getKeys();
  var currentPrefix = "MONTHLY_EXPORT_STATUS_";
  var currentSuffix = currentProcessingMonthKey.replace(currentPrefix, "");

  allKeys.forEach(function(key) {
    if (key.startsWith(currentPrefix)) {
      var keySuffix = key.replace(currentPrefix, "");
      if (keySuffix < currentSuffix) {
        properties.deleteProperty(key);
        Logger.log("Deleted old status key: " + key);
      }
    }
  });
}

// 前月のコメントをNotionにプッシュするメイン関数（実行ごとに1ユーザー）
function pushToNotionMonthly() {
  try {
    var processedMonthStr = getProcessedMonth(); // "YYYY-MM"
    var monthlyStatusKey = getMonthlyStatusKey(processedMonthStr);

    deleteOldMonthlyStatusKeys(monthlyStatusKey);

    var properties = PropertiesService.getScriptProperties();
    var monthlyStatusJSON = properties.getProperty(monthlyStatusKey);
    var monthlyStatus = monthlyStatusJSON ? JSON.parse(monthlyStatusJSON) : {};

    var scriptTimeZone = Session.getScriptTimeZone();

    // ステータスが初期化されていない場合（その月の初回処理時など）
    if (Object.keys(monthlyStatus).length === 0) {
      var sheet = SpreadsheetApp.openById(
        properties.getProperty("SPREADSHEET_ID")
      ).getSheetByName("おもちログ");
      if (!sheet) {
        Logger.log("おもちログシートが見つかりません。");
        return;
      }
      var data = sheet.getDataRange().getValues();
      var usersInMonth = {};

      // 前月の1日と末日を計算
      var firstDayOfProcessedMonth = new Date(processedMonthStr + "-01T00:00:00");
      var tempDate = new Date(firstDayOfProcessedMonth);
      tempDate.setMonth(tempDate.getMonth() + 1);
      tempDate.setDate(0); // 前月の末日
      var lastDayOfProcessedMonth = new Date(tempDate.getFullYear(), tempDate.getMonth(), tempDate.getDate(), 23, 59, 59);


      for (var i = 1; i < data.length; i++) { // ヘッダー行をスキップ
        var timestamp = new Date(data[i][0]);
        if (timestamp >= firstDayOfProcessedMonth && timestamp <= lastDayOfProcessedMonth) {
          var userId = data[i][1];
          if (userId) {
            usersInMonth[userId] = false; // 未処理としてマーク
          }
        }
      }
      if (Object.keys(usersInMonth).length === 0) {
        Logger.log(processedMonthStr + "に発言のあったユーザーはいませんでした。");
        properties.setProperty(monthlyStatusKey, JSON.stringify({})); // 空のステータスを保存して終了
        return;
      }
      monthlyStatus = usersInMonth;
      properties.setProperty(monthlyStatusKey, JSON.stringify(monthlyStatus));
      Logger.log(processedMonthStr + "の月次処理ステータスを初期化しました: " + JSON.stringify(monthlyStatus));
    }

    var unprocessedUserId = null;
    for (var userIdKey in monthlyStatus) {
      if (monthlyStatus.hasOwnProperty(userIdKey) && !monthlyStatus[userIdKey]) {
        unprocessedUserId = userIdKey;
        break;
      }
    }

    if (!unprocessedUserId) {
      Logger.log(processedMonthStr + "の全ユーザーの月次Notion連携は完了しています。");
      return;
    }

    Logger.log(processedMonthStr + "の未処理ユーザーを発見: " + unprocessedUserId + ". Notionページ作成を開始します。");

    // ユーザーのコメントを取得
    var userComments = [];
    var sheet = SpreadsheetApp.openById(
      properties.getProperty("SPREADSHEET_ID")
    ).getSheetByName("おもちログ");
    var data = sheet.getDataRange().getValues();
    
    var firstDayOfProcessedMonth = new Date(processedMonthStr + "-01T00:00:00");
    var tempDate = new Date(firstDayOfProcessedMonth);
    tempDate.setMonth(tempDate.getMonth() + 1);
    tempDate.setDate(0); 
    var lastDayOfProcessedMonth = new Date(tempDate.getFullYear(), tempDate.getMonth(), tempDate.getDate(), 23, 59, 59);


    for (var i = 1; i < data.length; i++) {
      var timestamp = new Date(data[i][0]);
      var msgUserId = data[i][1];
      var message = data[i][2];
      // var geminiMsg = data[i][3]; // 今回はGeminiメッセージは含めない

      if (msgUserId === unprocessedUserId && timestamp >= firstDayOfProcessedMonth && timestamp <= lastDayOfProcessedMonth) {
        userComments.push({
          timestamp: Utilities.formatDate(timestamp, scriptTimeZone, "yyyy/MM/dd HH:mm:ss"),
          message: message
        });
      }
    }

    if (userComments.length === 0) {
      Logger.log("ユーザー " + unprocessedUserId + " の " + processedMonthStr + " のコメントは見つかりませんでした。ステータスを更新します。");
      monthlyStatus[unprocessedUserId] = true;
      properties.setProperty(monthlyStatusKey, JSON.stringify(monthlyStatus));
      return;
    }
    
    // コメントを時系列順にソート (getValuesは基本的に時系列だが念のため)
    userComments.sort(function(a,b){
      return new Date(a.timestamp) - new Date(b.timestamp);
    });


    var userName = getDisplayName(unprocessedUserId) || "名前未設定ユーザー (" + unprocessedUserId.substring(0,8) + ")";
    var notionPageTitle = userName + "さんの" + processedMonthStr.replace("-","年") + "月のおきもち";

    var notionBlocks = [];

    // コメントを日付ごとにグループ化
    var commentsByDate = {};
    userComments.forEach(function(comment) {
      var dateStr = comment.timestamp.substring(0, 10); // "yyyy/MM/dd"
      if (!commentsByDate[dateStr]) {
        commentsByDate[dateStr] = [];
      }
      // コメントに時刻(HH:mm)を追加
      commentsByDate[dateStr].push(comment.message + "(" + comment.timestamp.substring(11,16) + ")");
    });

    // 日付ごとにブロックを生成し、notionBlocksに追加
    var sortedDates = Object.keys(commentsByDate).sort();

    for (var k = 0; k < sortedDates.length; k++) {
      var date = sortedDates[k];
      notionBlocks.push({
        object: "block",
        type: "heading_3",
        heading_3: {
          rich_text: [{ type: "text", text: { content: date } }]
        }
      });

      var messagesForDate = commentsByDate[date];
      for (var l = 0; l < messagesForDate.length; l++) {
        notionBlocks.push({
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [{ type: "text", text: { content: messagesForDate[l] } }]
          }
        });
      }
    }
    
    notionBlocks.push({ // フッターにLINEへのリンクを追加
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [
            {
              type: "text",
              text: {
                content: "https://line.me/R/ti/p/@838dxysu", // 実際のLINE BotのIDに合わせてください
                link: { url: "https://line.me/R/ti/p/@838dxysu" },
              },
            },
          ],
        },
      });

    var notionDatabaseId = properties.getProperty("NOTION_DATABASE_ID");
    if (!notionDatabaseId) {
        Logger.log("NOTION_DATABASE_ID が設定されていません。");
        logErrorToSheet("Notion Config Error", "NOTION_DATABASE_ID is not set for pushToNotionMonthly");
        return;
    }

    const payload = {
      parent: { database_id: notionDatabaseId },
      properties: {
        title: { // データベースのタイトルプロパティ名
          title: [{ text: { content: notionPageTitle } }]
        },
        ラベル: { // データベースのセレクトプロパティ名
          select: { name: "ひと月のおきもち" } // 新しいラベル
        },
        URL: { url: null },
        "Liked User": { people: [] },
        作成者メモ: { rich_text: [{ text: { content: processedMonthStr + " の " + userName + " のレポート" } }] },
      },
      children: notionBlocks
    };
    
    Logger.log("Notion API Payload for " + unprocessedUserId + ": " + JSON.stringify(payload).substring(0,500) + "...");


    var notionApiUrl = "https://api.notion.com/v1/pages";
    var notionResponse = sendRequestToNotion(notionApiUrl, "post", payload);

    if (notionResponse.code === 200) {
      Logger.log("Notionページを正常に作成しました for user: " + unprocessedUserId + ", month: " + processedMonthStr + ". Title: " + notionPageTitle);
      monthlyStatus[unprocessedUserId] = true;
      properties.setProperty(monthlyStatusKey, JSON.stringify(monthlyStatus));
    } else {
      Logger.log("Notionページの作成に失敗しました for user: " + unprocessedUserId + ", month: " + processedMonthStr + ". Code: " + notionResponse.code + ", Body: " + notionResponse.body);
      logErrorToSheet("Notion API Error pushToNotionMonthly", "User: " + unprocessedUserId + ", Month: " + processedMonthStr + ", Code: " + notionResponse.code + ", Body: " + notionResponse.body);
      // 失敗した場合でも、リトライを防ぐために一旦完了扱いにするか、エラーハンドリングを別途検討
      // ここでは、失敗した場合は次回再実行されるようにステータスは変更しない。
    }

  } catch (error) {
    Logger.log("Error in pushToNotionMonthly: " + error.message + (error.stack ? "\n" + error.stack : ""));
    logErrorToSheet("pushToNotionMonthly Exception", error.message + (error.stack ? "\n" + error.stack : ""));
  }
}

// Notion APIにリクエストを送信する共通関数
function sendRequestToNotion(url, method, payload) {
  var notionToken =
    PropertiesService.getScriptProperties().getProperty("NOTION_TOKEN");
  var headers = {
    Authorization: "Bearer " + notionToken,
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
  };
  var options = {
    method: method,
    headers: headers,
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  var response = UrlFetchApp.fetch(url, options);
  var code = response.getResponseCode();
  var body = response.getContentText();

  return {
    code: code,
    body: body,
  };
}

// 処理済みイベントの重複チェック機能
function isDuplicateEvent(webhookEventId) {
  var sheet = getProcessedEventsSheet();
  var data = sheet.getDataRange().getValues();
  
  // 過去24時間以内の処理済みイベントをチェック
  var yesterday = new Date();
  yesterday.setHours(yesterday.getHours() - 24);
  
  for (var i = 1; i < data.length; i++) { // ヘッダー行をスキップ
    if (data[i][1] === webhookEventId && data[i][0] > yesterday) {
      return true; // 重複発見
    }
  }
  return false;
}

function recordProcessedEvent(webhookEventId) {
  var sheet = getProcessedEventsSheet();
  sheet.appendRow([new Date(), webhookEventId]);
  
  // 古いレコードを削除（24時間以前のものを削除）
  cleanupOldEvents(sheet);
}

function getProcessedEventsSheet() {
  var spreadsheet = SpreadsheetApp.openById(
    PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID")
  );
  var sheet = spreadsheet.getSheetByName("processed_events");
  if (!sheet) {
    sheet = spreadsheet.insertSheet("processed_events");
    sheet.appendRow(["処理時刻", "WebhookEventId"]);
  }
  return sheet;
}

function cleanupOldEvents(sheet) {
  var data = sheet.getDataRange().getValues();
  var yesterday = new Date();
  yesterday.setHours(yesterday.getHours() - 24);
  
  // 古いデータを削除（下から上へ削除して行番号のずれを防ぐ）
  for (var i = data.length - 1; i > 0; i--) { // ヘッダー行は残す
    if (data[i][0] < yesterday) {
      sheet.deleteRow(i + 1);
    }
  }
}

// ...existing code...
