/**
 * メッセージ送信クラス
 * LINE Messaging APIを使用してメッセージを送信
 */
class MessageSender {
  
  /**
   * リプライメッセージを送信
   */
  static sendReply(replyToken, replyMessage) {
    const url = "https://api.line.me/v2/bot/message/reply";
    const token = Config.getLineAccessToken();

    const payload = {
      replyToken: replyToken,
      messages: [{
        type: "text",
        text: replyMessage,
      }],
    };

    const options = {
      method: "post",
      contentType: "application/json",
      headers: {
        Authorization: "Bearer " + token,
      },
      payload: JSON.stringify(payload),
    };

    try {
      const response = UrlFetchApp.fetch(url, options);
      const responseCode = response.getResponseCode();
      Logger.log("Response Code: " + responseCode);

      if (responseCode !== 200) {
        const responseText = response.getContentText();
        Logger.log("Response Error: " + responseText);
        ErrorLogger.log("LINE API Error", "Code: " + responseCode + ", Response: " + responseText);
      }
    } catch (error) {
      Logger.log("Error in sendReply: " + error.message);
      ErrorLogger.log("sendReply Error", error.message);
    }
  }

  /**
   * 名前確認メッセージを送信
   */
  static askForNameConfirmation(replyToken, proposedName) {
    const url = "https://api.line.me/v2/bot/message/reply";
    const token = Config.getLineAccessToken();

    const payload = {
      replyToken: replyToken,
      messages: [{
        type: "template",
        altText: "名前の確認",
        template: {
          type: "buttons",
          text: "あなたの名前は「" + proposedName + "」でよいですか？",
          actions: [
            {
              type: "postback",
              label: "はい",
              data: "confirm_name_yes:" + proposedName,
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
      }],
    };

    this.sendWithErrorHandling(url, token, payload, "askForNameConfirmation");
  }

  /**
   * 名前再入力を促すメッセージを送信
   */
  static askForNameAgain(replyToken) {
    this.sendReply(replyToken, "名前を再度教えてください。");
  }

  /**
   * 使い方ガイドを送信
   */
  static sendUsageGuide(replyToken, userName) {
    const url = "https://api.line.me/v2/bot/message/reply";
    const token = Config.getLineAccessToken();

    const intro = "👋 おもちだよ！\n" + userName + "、まったりしていってね！\n" +
                  "あなたのつぶやきを記録するよ。\n\n";
    
    const guide = "📖 使い方ガイド 📖\n" +
                  "• 基本的にはただつぶやくだけ\n" +
                  "• 「/setname あなたの名前」名前を設定し直せるよ\n" +
                  "• 「/delete」直前のつぶやきを削除できるよ\n" +
                  "• 「/delete hh:mm (例: /delete 10:30)」時間指定で削除できるよ\n";

    // 返答候補リスト
    const responses = [
      "ひらめいた", "ワクワクしてきた", "イメージ通り", "もう探検に出られそう",
      "想定の範囲内", "おいしそう…", "お前の気持ちもわかる", "完全に理解した",
      "未来を感じる！", "わがままも聞いてくれ"
    ];
    
    const choices = responses.sort(() => Math.random() - 0.5).slice(0, 3);
    const actions = choices.map(text => ({ type: "message", label: text, text: text }));

    const payload = {
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

    this.sendWithErrorHandling(url, token, payload, "sendUsageGuide");
  }

  /**
   * ウェルカムメッセージを送信
   */
  static sendWelcomeMessage(replyToken) {
    const url = "https://api.line.me/v2/bot/message/reply";
    const token = Config.getLineAccessToken();

    const payload = {
      replyToken: replyToken,
      messages: [{
        type: "template",
        altText: "おもちだよ、よろしくな",
        template: {
          type: "buttons",
          text: "おもちだよ、よろしくな",
          actions: [{
            type: "message",
            label: "よろしく",
            text: "よろしく",
          }],
        },
      }],
    };

    this.sendWithErrorHandling(url, token, payload, "sendWelcomeMessage");
  }

  /**
   * エラーハンドリング付きでメッセージを送信
   */
  static sendWithErrorHandling(url, token, payload, functionName) {
    const options = {
      method: "post",
      contentType: "application/json",
      headers: { Authorization: "Bearer " + token },
      payload: JSON.stringify(payload),
    };

    try {
      UrlFetchApp.fetch(url, options);
    } catch (error) {
      Logger.log("Error in " + functionName + ": " + error.message);
      ErrorLogger.log(functionName + " Error", error.message);
    }
  }
}
