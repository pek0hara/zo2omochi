/**
 * コマンド処理クラス
 * ユーザーからのコマンド入力を処理
 */
class CommandProcessor {
  
  /**
   * コマンドを処理
   * @param {string} messageText - メッセージテキスト
   * @param {string} replyToken - リプライトークン
   * @param {string} userId - ユーザーID
   * @param {string} userName - ユーザー名
   * @returns {Object|null} - レスポンスオブジェクトまたはnull（コマンドでない場合）
   */
  static processCommand(messageText, replyToken, userId, userName) {
    // ウェルカムメッセージコマンド
    if (messageText.startsWith("/welcome")) {
      MessageSender.sendWelcomeMessage(replyToken);
      return ResponseHelper.createSuccessResponse();
    }

    // 名前設定コマンド
    if (messageText.startsWith("/setname ")) {
      return this.handleSetNameCommand(messageText, replyToken, userId);
    }

    // 削除コマンド
    if (messageText.startsWith("/delete")) {
      return this.handleDeleteCommand(messageText, replyToken, userId);
    }

    // 使い方ガイドコマンド
    if (this.isHelpCommand(messageText)) {
      MessageSender.sendUsageGuide(replyToken, userName);
      return ResponseHelper.createSuccessResponse();
    }

    return null; // コマンドではない
  }

  /**
   * 名前設定コマンドの処理
   */
  static handleSetNameCommand(messageText, replyToken, userId) {
    const newName = messageText.replace("/setname ", "").trim();
    if (newName) {
      UserManager.setUserName(userId, newName);
      MessageSender.sendReply(replyToken, "名前を「" + newName + "」に設定したよ！");
    } else {
      MessageSender.sendReply(replyToken, "名前を設定できませんでした。正しい形式で入力してください。");
    }
    return ResponseHelper.createSuccessResponse();
  }

  /**
   * 削除コマンドの処理
   */
  static handleDeleteCommand(messageText, replyToken, userId) {
    MessageDeletion.handleDeleteCommand(userId, messageText, replyToken);
    return ResponseHelper.createSuccessResponse();
  }

  /**
   * ヘルプコマンドかどうかを判定
   */
  static isHelpCommand(messageText) {
    return messageText.startsWith("使い方") ||
           messageText.startsWith("つかいかた") ||
           messageText === "ヘルプ" ||
           messageText === "へるぷ";
  }
}
