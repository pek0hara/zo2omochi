/**
 * メッセージ削除機能クラス
 * ユーザーのメッセージ削除要求を処理
 */
class MessageDeletion {
  
  /**
   * 削除コマンドを処理
   */
  static handleDeleteCommand(userId, messageText, replyToken) {
    const command = messageText.trim();
    
    if (command === "/delete") {
      this.deleteLastMessage(userId, replyToken);
    } else if (command.startsWith("/delete ")) {
      const timeString = command.replace("/delete ", "").trim();
      this.deleteMessageByTime(userId, timeString, replyToken);
    } else {
      MessageSender.sendReply(replyToken, "削除コマンドの形式が正しくありません。\n/delete または /delete HH:MM の形式で入力してください。");
    }
  }

  /**
   * 直前のメッセージを削除
   */
  static deleteLastMessage(userId, replyToken) {
    try {
      const latestMessage = MessageHistory.getLatestMessage(userId);
      
      if (!latestMessage) {
        MessageSender.sendReply(replyToken, "削除できるメッセージが見つかりません。");
        return;
      }

      const success = MessageHistory.deleteMessage(latestMessage.rowIndex);
      
      if (success) {
        const timeString = Utilities.formatDate(latestMessage.timestamp, "Asia/Tokyo", "HH:mm");
        MessageSender.sendReply(
          replyToken,
          `${timeString}のメッセージ「${latestMessage.messageText}」を削除しました。`
        );
      } else {
        MessageSender.sendReply(replyToken, "メッセージの削除に失敗しました。");
      }
    } catch (error) {
      Logger.log("Error in deleteLastMessage: " + error.message);
      MessageSender.sendReply(replyToken, "削除処理中にエラーが発生しました。");
    }
  }

  /**
   * 指定時間のメッセージを削除
   */
  static deleteMessageByTime(userId, timeString, replyToken) {
    try {
      // 時間形式の検証
      if (!this.isValidTimeFormat(timeString)) {
        MessageSender.sendReply(
          replyToken,
          "時間の形式が正しくありません。HH:MM（例：10:30）の形式で入力してください。"
        );
        return;
      }

      const message = MessageHistory.findMessageByTime(userId, timeString);
      
      if (!message) {
        MessageSender.sendReply(
          replyToken,
          `${timeString}のメッセージが見つかりません。今日のメッセージのみ削除できます。`
        );
        return;
      }

      const success = MessageHistory.deleteMessage(message.rowIndex);
      
      if (success) {
        MessageSender.sendReply(
          replyToken,
          `${timeString}のメッセージ「${message.messageText}」を削除しました。`
        );
      } else {
        MessageSender.sendReply(replyToken, "メッセージの削除に失敗しました。");
      }
    } catch (error) {
      Logger.log("Error in deleteMessageByTime: " + error.message);
      MessageSender.sendReply(replyToken, "削除処理中にエラーが発生しました。");
    }
  }

  /**
   * 時間形式の検証
   */
  static isValidTimeFormat(timeString) {
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    return timeRegex.test(timeString);
  }
}
