/**
 * 設定管理クラス
 * スクリプトプロパティからの設定値取得を担当
 */
class Config {
  
  /**
   * LINE Channel Access Tokenを取得
   */
  static getLineAccessToken() {
    return PropertiesService.getScriptProperties().getProperty("LINE_CHANNEL_ACCESS_TOKEN");
  }

  /**
   * BotのユーザーIDを取得
   */
  static getBotUserId() {
    return PropertiesService.getScriptProperties().getProperty("BOT_USER_ID");
  }

  /**
   * SpreadsheetのIDを取得
   */
  static getSpreadsheetId() {
    return PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  }

  /**
   * Gemini API Keyを取得
   */
  static getGeminiApiKey() {
    return PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");
  }

  /**
   * Notion Tokenを取得
   */
  static getNotionToken() {
    return PropertiesService.getScriptProperties().getProperty("NOTION_TOKEN");
  }

  /**
   * Notion Database IDを取得
   */
  static getNotionDatabaseId() {
    return PropertiesService.getScriptProperties().getProperty("NOTION_DATABASE_ID");
  }
}
