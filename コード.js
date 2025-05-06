function doPost(e) {
  try {
    var contents = JSON.parse(e.postData.contents);
    var event = contents.events[0];
    var userId = event.source.userId;

    // postbackの「はい」を受け取ったときの処理
    if (event.type === 'postback' && event.postback.data.startsWith('confirm_name_yes:')) {
      
      // postbackからユーザーが入力した名前を取得
      var proposedName = event.postback.data.replace('confirm_name_yes:', '');

      // 名前を保存
      setUserName(userId, proposedName);
      // 使い方を返信
      sendUsageGuide(event.replyToken, getDisplayName(userId));
      return ContentService.createTextOutput(
        JSON.stringify({ "result": "success" })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // postbackの「いいえ」を受け取ったときの処理
    if (event.type === 'postback' && event.postback.data === 'confirm_name_no') {
      askForNameAgain(event.replyToken);
      return ContentService
        .createTextOutput(JSON.stringify({ "result": "success" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 友達追加（follow）時の挨拶
    if (event.type === 'follow') {
      sendWelcomeMessage(event.replyToken);
      return ContentService
        .createTextOutput(JSON.stringify({ "result": "success" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (event.type === 'message' && event.message.type === 'text' && event.source.type === 'user') {
      var messageText = event.message.text;
      var userName = getDisplayName(userId);

      if (messageText.startsWith("/welcome")) {
        sendWelcomeMessage(event.replyToken);
        return ContentService
          .createTextOutput(JSON.stringify({ "result": "success" }))
          .setMimeType(ContentService.MimeType.JSON);
      }

      // 名前が未設定の場合
      if (!userName || userName === "") {
          // 名前の確認を促すメッセージを送信
          sendReply(event.replyToken, "あなたの名前を教えて！");
          // 名前に「誰か」を設定
          setUserName(userId, "誰か");

        return ContentService.createTextOutput(JSON.stringify({ "result": "success" }))
          .setMimeType(ContentService.MimeType.JSON);
      }

      // 名前が未設定の場合
      if (userName === "誰か") {
        // ユーザーが入力したテキストを名前候補とする
        var proposedName = messageText.trim();
        if (proposedName && proposedName.length > 0) { // 空文字でないことを確認
          // 名前確認メッセージを送信
          askForNameConfirmation(event.replyToken, proposedName);
        } else {
          // 名前として無効な入力の場合、再度入力を促す
          sendReply(event.replyToken, "あなたの名前を教えてください。");
        }
        return ContentService.createTextOutput(JSON.stringify({ "result": "success" }))
          .setMimeType(ContentService.MimeType.JSON);
      }

      // 名前を設定するコマンド
      if (messageText.startsWith("/setname ")) {
        var newName = messageText.replace("/setname ", "").trim();
        if (newName) {
          setUserName(userId, newName);
          sendReply(event.replyToken, "名前を「" + newName + "」に設定したよ！");
        } else {
          sendReply(event.replyToken, "名前を設定できませんでした。正しい形式で入力してください。");
        }
        return ContentService.createTextOutput(JSON.stringify({ "result": "success" }))
          .setMimeType(ContentService.MimeType.JSON);
      }

      // 削除コマンド
      if (messageText.startsWith("/delete")) {
        handleDeleteCommand(userId, messageText, event.replyToken);
        return ContentService.createTextOutput(JSON.stringify({ "result": "success" }))
          .setMimeType(ContentService.MimeType.JSON);
      }

      // 使い方ガイド表示: 「使い方」または「つかいかた」から始まるメッセージ
      if (messageText.startsWith("使い方") || messageText.startsWith("つかいかた")
          || messageText === "ヘルプ" || messageText === "へるぷ") {
        sendUsageGuide(event.replyToken, userName);
        return ContentService.createTextOutput(JSON.stringify({ "result": "success" }))
          .setMimeType(ContentService.MimeType.JSON);
      }

      // 現在のつぶやきをスプレッドシートに保存
      logToMainSheet(userId, messageText);

      // 通常の処理: getTodaysMessages を呼び出して、今日のメッセージを取得
      var todaysMessages = getTodaysMessages(userId);
      var replyMessage = "今日のつぶやき:\n" +
        todaysMessages.map(msg => msg).join("\n");
      sendReply(event.replyToken, replyMessage);

      return ContentService.createTextOutput(JSON.stringify({ "result": "success" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  } catch (error) {
    Logger.log("Error in doPost: " + error.message);
    logErrorToSheet(error.message, error.stack); // エラーをスプレッドシートに記録
    return ContentService.createTextOutput(JSON.stringify({ "result": "error", "message": error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// 名前確認メッセージを送信する関数
function askForNameConfirmation(replyToken, proposedName) {
  var url = "https://api.line.me/v2/bot/message/reply";
  var token = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_ACCESS_TOKEN');

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
              displayText: "はい"
            },
            {
              type: "postback",
              label: "いいえ",
              data: "confirm_name_no",
              displayText: "いいえ"
            }
          ]
        }
      }
    ]
  };

  var options = {
    method: "post",
    contentType: "application/json",
    headers: {
      "Authorization": "Bearer " + token
    },
    payload: JSON.stringify(payload)
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
  var url   = "https://api.line.me/v2/bot/message/reply";
  var token = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_ACCESS_TOKEN');
  var intro =
    '👋 おもちだよ！\n' +
    userName + '、まったりしていってね！\n' +
    'あなたのつぶやきを記録するよ。\n\n';
  var guide =
    '📖 使い方ガイド 📖\n' +
    '• 基本的にはただつぶやくだけ\n' +
    '• 「/setname あなたの名前」名前を設定し直せるよ\n' +
    '• 「/delete」直前のつぶやきを削除できるよ\n' +
    '• 「/delete hh:mm (例: /delete 10:30)」時間指定で削除できるよ\n';

  // 返答候補リスト
  var responses = [
    'ひらめいた',
    'ワクワクしてきた',
    'イメージ通り',
    'もう探検に出られそう',
    '想定の範囲内',
    'おいしそう…',
    'お前の気持ちもわかる',
    '完全に理解した',
    '未来を感じる！',
    'わがままも聞いてくれ'
  ];
  // シャッフルして3つ取得
  var choices = responses.sort(() => Math.random() - 0.5).slice(0, 3);
  var actions = choices.map(function(text) {
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
          actions: actions
        }
      }
    ]
  };
  var options = {
    method: "post",
    contentType: "application/json",
    headers: { "Authorization": "Bearer " + token },
    payload: JSON.stringify(payload)
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
  var token = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_ACCESS_TOKEN');
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
              text: "よろしく"
            }
          ]
        }
      }
    ]
  };
  var options = {
    method: "post",
    contentType: "application/json",
    headers: { "Authorization": "Bearer " + token },
    payload: JSON.stringify(payload)
  };
  try {
    UrlFetchApp.fetch(url, options);
  } catch (error) {
    Logger.log("Error in sendWelcomeMessage: " + error.message);
    logErrorToSheet("sendWelcomeMessage Error", error.message);
  }
}

// 他のユーザーの最新のつぶやきを取得する関数
function getLatestMessageFromOthers(currentUserId) {
  var sheet = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID')).getSheetByName('おもちログ');
  if (!sheet) return null;

  var data = sheet.getDataRange().getValues();
  for (var i = data.length - 1; i > 0; i--) { // 最新の行から検索
    var userId = data[i][1]; // ユーザーID列
    var message = data[i][2]; // メッセージ列
    if (userId !== currentUserId) {
      return message; // 自分以外のつぶやきを返す
    }
  }
  return null; // 他のユーザーのつぶやきがない場合
}

// 直近のつぶやきを取得する関数
function getRecentMessages(userId) {
  var sheet = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID')).getSheetByName('おもちログ');
  if (!sheet) return [];

  var data = sheet.getDataRange().getValues();
  var today = new Date();
  today.setHours(0, 0, 0, 0); // 今日の日付の0時0分0秒を設定

  var todaysMessages = [];
  for (var i = data.length - 1; i > 0; i--) { // 最新の行から取得
    var timestamp = new Date(data[i][0]); // 日時列
    var messageUserId = data[i][1]; // ユーザーID列
    var message = data[i][2]; // メッセージ列

    // 自分の書き込みかつ今日の日付のものを取得
    if (messageUserId === userId && timestamp >= today) {
      var time = Utilities.formatDate(timestamp, Session.getScriptTimeZone(), "HH:mm");
      todaysMessages.push(time + " " + message); // 時刻とメッセージを結合
    }
  }

  return todaysMessages.reverse(); // 配列を逆順にして返す
}

// ユーザーIDと名前を紐づける
function getDisplayName(userId) {
  var userMap = PropertiesService.getScriptProperties().getProperty('USER_MAP');
  userMap = userMap ? JSON.parse(userMap) : {};

  // ユーザーが設定した名前を取得
  var userName = userMap[userId];

  return userName; // 設定された名前を返す
}

// LINE Messaging API を使って返信を送信する関数
function sendReply(replyToken, replyMessage) {
  var url = "https://api.line.me/v2/bot/message/reply";
  var token = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_ACCESS_TOKEN'); // アクセストークンをスクリプトプロパティから取得

  var payload = {
    replyToken: replyToken,
    messages: [
      {
        type: "text",
        text: replyMessage
      }
    ]
  };

  var options = {
    method: "post",
    contentType: "application/json",
    headers: {
      "Authorization": "Bearer " + token
    },
    payload: JSON.stringify(payload)
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

// リプライの成功/失敗をスプレッドシートに記録する関数
function logReplyStatus(status, replyMessage, responseCode, responseText) {
  var spreadsheet = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID'));
  var sheet = spreadsheet.getSheetByName('reply_log');
  if (!sheet) {
    sheet = spreadsheet.insertSheet('reply_log');
    sheet.appendRow(['日時', 'ステータス', '返信メッセージ', 'レスポンスコード', 'レスポンス内容']);
  }
  var date = new Date();
  sheet.appendRow([date, status, replyMessage, responseCode, responseText]);
}

function logToMainSheet(userId, messageText) {
  var sheet = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID')).getSheetByName('おもちログ');
  if (!sheet) {
    sheet = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID')).insertSheet('おもちログ');
    sheet.appendRow(['日時', 'ユーザーID', '本文']);
  }
  var date = new Date();
  sheet.appendRow([date, userId, messageText]);
}

// エラーをスプレッドシートの "error" シートに記録する関数
function logErrorToSheet(errorMessage, stackTrace) {
  var spreadsheet = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID'));
  var sheet = spreadsheet.getSheetByName('error');
  if (!sheet) {
    sheet = spreadsheet.insertSheet('error');
    sheet.appendRow(['日時', 'エラーメッセージ', 'スタックトレース']);
  }
  var date = new Date();
  sheet.appendRow([date, errorMessage, stackTrace]);
}

function setUserName(userId, newName) {
  var userMap = PropertiesService.getScriptProperties().getProperty('USER_MAP');
  userMap = userMap ? JSON.parse(userMap) : {};

  // 名前を保存
  userMap[userId] = newName;
  PropertiesService.getScriptProperties().setProperty('USER_MAP', JSON.stringify(userMap));
}

function getTodaysMessages(userId) {
  var sheet = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID')).getSheetByName('おもちログ');
  if (!sheet) return [];

  var data = sheet.getDataRange().getValues();
  var today = new Date();
  today.setHours(0, 0, 0, 0); // 今日の日付の0時0分0秒を設定

  var todaysMessages = [];
  for (var i = data.length - 1; i > 0; i--) { // 最新の行から取得
    var timestamp = new Date(data[i][0]); // 日時列
    var messageUserId = data[i][1]; // ユーザーID列
    var message = data[i][2]; // メッセージ列

    // 自分の書き込みかつ今日の日付のものを取得
    if (messageUserId === userId && timestamp >= today) {
      var time = Utilities.formatDate(timestamp, Session.getScriptTimeZone(), "HH:mm");
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
      sendReply(replyToken, "時間の形式が正しくありません。hh:mm形式で指定してください。\n例: /delete 10:30");
    }
  } else {
    sendReply(replyToken, "コマンドの形式が正しくありません。\n直前の削除: /delete\n時間指定削除: /delete hh:mm");
  }
}

// 直前の書き込みを削除する関数
function deleteLastMessage(userId, replyToken) {
  var spreadsheetId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  var mainSheetName = 'おもちログ';
  var deleted = false;
  var deletedMessage = "";

  // メインログシートから削除
  var mainSheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName(mainSheetName);
  if (mainSheet) {
    var mainData = mainSheet.getDataRange().getValues();
    for (var i = mainData.length - 1; i > 0; i--) { // ヘッダー行を除き、最新から検索
      if (mainData[i][1] === userId) { // ユーザーIDが一致
        deletedMessage = mainData[i][2]; // 削除するメッセージを取得
        mainSheet.deleteRow(i + 1); // 行削除 (インデックス+1が行番号)
        deleted = true;
        break; // 最新の1件のみ削除
      }
    }
  }

  if (deleted) {
    sendReply(replyToken, "直前のつぶやき「" + deletedMessage + "」を削除したよ！");
  } else {
    sendReply(replyToken, "削除できるあなたのつぶやきが見つかりませんでした。");
  }
}

// 指定時間の書き込みを削除する関数
function deleteMessageByTime(userId, timeString, replyToken) {
  var spreadsheetId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  var mainSheetName = 'おもちログ';
  var deleted = false;
  var deletedMessage = "";
  var targetTime = timeString; // hh:mm 形式

  var today = new Date();
  today.setHours(0, 0, 0, 0); // 今日の日付の0時0分0秒

  // メインログシートから削除
  var mainSheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName(mainSheetName);
  if (mainSheet) {
    var mainData = mainSheet.getDataRange().getValues();
    var rowsToDelete = []; // 削除対象の行インデックスを保存
    for (var i = mainData.length - 1; i > 0; i--) { // ヘッダー行を除き、最新から検索
      var timestamp = new Date(mainData[i][0]);
      var messageUserId = mainData[i][1];
      var messageTime = Utilities.formatDate(timestamp, Session.getScriptTimeZone(), "HH:mm");

      // ユーザーIDが一致、今日の日付、指定時刻が一致
      if (messageUserId === userId && timestamp >= today && messageTime === targetTime) {
        deletedMessage = mainData[i][2]; // 削除するメッセージを取得
        rowsToDelete.push(i + 1); // 行番号を保存
        deleted = true;
        // 同じ時間の投稿が複数ある可能性を考慮し、ここでは break しない
      }
    }
    // 削除対象行を後ろから削除 (行がずれるのを防ぐため)
    rowsToDelete.sort((a, b) => b - a).forEach(rowIndex => {
      mainSheet.deleteRow(rowIndex);
    });
  }

  if (deleted) {
    sendReply(replyToken, targetTime + " のつぶやき「" + deletedMessage + "」を削除しました。");
  } else {
    sendReply(replyToken, "指定された時間(" + targetTime + ")のあなたのつぶやきが見つかりませんでした。");
  }
}

// 直近24時間分をまとめて Notion に連携する
function pushToNotionDaily() {
  var now = new Date();
  var yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  var sheet = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID')).getSheetByName('おもちログ');
  if (!sheet) return;

  var data = sheet.getDataRange().getValues();

  // 24時間内の行だけ抽出
  var recent = data.slice(1).filter(function(row) {
    var ts = new Date(row[0]);
    return ts >= yesterday && ts <= now;
  });

  // ユーザーごとにグループ化
  var grouped = {};
  recent.forEach(function(row) {
    var userId = row[1];
    var userName = getDisplayName(userId) || "誰か"; // 名前を取得、なければデフォルト
    var ts = Utilities.formatDate(new Date(row[0]), Session.getScriptTimeZone(), 'HH:mm');
    var msg = row[2];
    var line = ts + '「' + msg + '」';
    (grouped[userName] = grouped[userName] || []).push(line);
  });

  // 本文生成
  var contentLines = [];
  Object.keys(grouped).forEach(function(userName) {
    contentLines.push(userName);
    contentLines = contentLines.concat(grouped[userName]);
    contentLines.push(''); // 空行で区切り
  });
  var content = contentLines.join('\n');

  var notionToken = PropertiesService.getScriptProperties().getProperty('NOTION_TOKEN');
  var databaseId = PropertiesService.getScriptProperties().getProperty('NOTION_DATABASE_ID');

  // payload 定義
  const payload = {
    parent: { database_id: databaseId },
    properties: {
      'title': { // データベースのタイトルプロパティ名
        title: [
          { text: { content: `${now.toISOString().slice(0, 10)} おもちのきもち` } }
        ]
      },
      'ラベル': { // データベースのセレクトプロパティ名
        select: { name: '今日のおもち' }
      },
      'URL': { // データベースのURLプロパティ名
        url: null // 空の場合は `null` を設定
      },
      'Liked User': { // データベースの People プロパティ名
        people: [] // 空の配列を設定
      },
      '作成者メモ': { // データベースのリッチテキストプロパティ名
        rich_text: [
          { text: { content: "" } }
        ]
      }
    },
    children: [ // ページの本文
      {
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [
            {
              type: "text",
              text: {
                content: content
              }
            }
          ]
        }
      }
    ]
  };

  Logger.log('Notion Database ID: ' + databaseId);
  var url = 'https://api.notion.com/v1/pages';
  var headers = {
    'Authorization': 'Bearer ' + notionToken,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json'
  };
  var options = {
    method: 'post',
    headers: headers,
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch(url, options);
  var code = response.getResponseCode();
  var body = response.getContentText();
  Logger.log('pushToNotionDaily response code: ' + code);
  Logger.log('pushToNotionDaily response body: ' + body);
  if (code !== 200) {
    throw new Error('Notion API Error ' + code);
  }
}