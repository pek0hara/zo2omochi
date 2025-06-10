/**
 * イベント処理クラス
 * LINE Webhookイベントの種類別処理を担当
 */
class EventProcessor {
  
  /**
   * イベントを種類別に処理
   */
  static processEvent(event) {
    const userId = event.source.userId;
    const botUserId = Config.getBotUserId();

    // postback イベントの処理
    if (event.type === "postback") {
      return this.handlePostbackEvent(event, userId);
    }

    // follow イベントの処理
    if (event.type === "follow") {
      MessageSender.sendWelcomeMessage(event.replyToken);
      return ResponseHelper.createSuccessResponse();
    }

    // メッセージイベントの処理
    if (event.type === "message" && event.message.type === "text") {
      return this.handleTextMessage(event, userId, botUserId);
    }

    return ResponseHelper.createSuccessResponse();
  }

  /**
   * postbackイベントの処理
   */
  static handlePostbackEvent(event, userId) {
    const postbackData = event.postback.data;

    // 名前確認の「はい」
    if (postbackData.startsWith("confirm_name_yes:")) {
      const proposedName = postbackData.replace("confirm_name_yes:", "");
      UserManager.setUserName(userId, proposedName);
      MessageSender.sendUsageGuide(event.replyToken, UserManager.getDisplayName(userId));
      return ResponseHelper.createSuccessResponse();
    }

    // 名前確認の「いいえ」
    if (postbackData === "confirm_name_no") {
      MessageSender.askForNameAgain(event.replyToken);
      return ResponseHelper.createSuccessResponse();
    }

    return ResponseHelper.createSuccessResponse();
  }

  /**
   * テキストメッセージの処理
   */
  static handleTextMessage(event, userId, botUserId) {
    // リプライメッセージかどうかをチェック
    const isReply = event.message.quotedMessageId !== undefined;
    const quotedMessageId = event.message.quotedMessageId || null;
    
    // グループメッセージでのメンション処理
    let messageText = this.processMentions(event, botUserId);
    if (messageText === null) {
      // Botへのメンションがないグループメッセージは無視
      return ResponseHelper.createSuccessResponse("Not mentioned to bot");
    }

    const userName = UserManager.getDisplayName(userId);

    // リプライメッセージの場合は特別な処理
    if (isReply) {
      return this.handleReplyMessage(messageText, userId, event, quotedMessageId);
    }

    // コマンド処理
    const commandResult = CommandProcessor.processCommand(messageText, event.replyToken, userId, userName);
    if (commandResult !== null) {
      return commandResult;
    }

    // 名前未設定の場合の処理
    const nameResult = this.handleNameSetup(messageText, userName, userId, event.replyToken);
    if (nameResult !== null) {
      return nameResult;
    }

    // 通常のメッセージ処理
    return this.handleNormalMessage(messageText, userId, event);
  }

  /**
   * リプライメッセージの処理
   */
  static handleReplyMessage(messageText, userId, event, quotedMessageId) {
    const userName = UserManager.getDisplayName(userId);
    
    // リプライメッセージであることをログに記録
    const logMessage = `[リプライ] 元メッセージID: ${quotedMessageId}`;
    Logger.log(`Reply detected - User: ${userId}, QuotedMessageId: ${quotedMessageId}, Text: ${messageText}`);
    
    // 自分のログから元メッセージを検索（可能な場合のみ）
    const quotedMessageInfo = MessageHistory.findQuotedMessage(quotedMessageId);
    
    let replyContext = "";
    if (quotedMessageInfo) {
      replyContext = `\n[元メッセージ: "${quotedMessageInfo.text}"への返信として]`;
      Logger.log(`Found quoted message: ${quotedMessageInfo.text}`);
    } else {
      // 元メッセージが見つからない場合（ボット記録外のメッセージ）
      replyContext = `\n[何かのメッセージ（ID: ${quotedMessageId}）への返信として]`;
      Logger.log(`Quoted message not found in our records: ${quotedMessageId}`);
    }
    
    const todaysMessages = event.source.type === "user" ? 
      MessageHistory.getTodaysMessages(userId) : [];
    
    const prompt = replyContext + "\n\nあなたはLINEBOTです。上記のリプライメッセージに1行でかわいくツッコんでください！";
    const geminiMessage = GeminiAPI.getMessage(messageText, prompt);
    
    const replyMessage = [
      `💬 ${geminiMessage}`,
      logMessage,
      ...todaysMessages,
      `${Config.formatDate(Config.getNow(), "HH:mm")} ${messageText}`
    ].join("\n");

    MessageSender.sendReply(event.replyToken, replyMessage);
    MessageHistory.logToMainSheet(userId, messageText, geminiMessage, quotedMessageId, event.message.id);
    
    return ResponseHelper.createSuccessResponse();
  }

  /**
   * グループメッセージでのメンション処理
   */
  static processMentions(event, botUserId) {
    if (event.source.type === "group") {
      const isMentionedToBot = event.message.mention &&
                              event.message.mention.mentionees &&
                              event.message.mention.mentionees.some(m => m.userId === botUserId);
      
      if (!isMentionedToBot) {
        return null; // Botへのメンションがない
      }

      // メンション部分を削除
      return MentionProcessor.removeBotMentions(event.message, botUserId);
    }

    return event.message.text;
  }

  /**
   * 名前設定処理
   */
  static handleNameSetup(messageText, userName, userId, replyToken) {
    if (!userName || userName === "") {
      MessageSender.sendReply(replyToken, "あなたの名前を教えて！");
      UserManager.setUserName(userId, "誰か");
      return ResponseHelper.createSuccessResponse();
    }

    if (userName === "誰か") {
      const proposedName = messageText.trim();
      if (proposedName && proposedName.length > 0) {
        MessageSender.askForNameConfirmation(replyToken, proposedName);
      } else {
        MessageSender.sendReply(replyToken, "あなたの名前を教えてください。");
      }
      return ResponseHelper.createSuccessResponse();
    }

    return null; // 名前設定済み
  }

  /**
   * 通常のメッセージ処理
   */
  static handleNormalMessage(messageText, userId, event) {
    const todaysMessages = event.source.type === "user" ? 
      MessageHistory.getTodaysMessages(userId) : [];
    
    const prompt = "\n\nあなたはLINEBOTです。上記の発言に1行でかわいくツッコんでください！";
    const geminiMessage = GeminiAPI.getMessage(messageText, prompt);
    
    const replyMessage = [
      geminiMessage,
      ...todaysMessages,
      `${Config.formatDate(Config.getNow(), "HH:mm")} ${messageText}`
    ].join("\n");

    MessageSender.sendReply(event.replyToken, replyMessage);
    MessageHistory.logToMainSheet(userId, messageText, geminiMessage, null, event.message.id);

    // Notionへの同期
    try {
      NotionIntegration.syncToNotion();
      console.log('Hourly push to Notion completed successfully');
    } catch (error) {
      console.error('Error in hourly trigger:', error);
    }

    return ResponseHelper.createSuccessResponse();
  }
}
