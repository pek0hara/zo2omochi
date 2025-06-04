/**
 * レスポンスヘルパークラス
 * HTTP レスポンスの生成を担当
 */
class ResponseHelper {
  
  /**
   * 成功レスポンスを作成
   */
  static createSuccessResponse(message = "success") {
    return ContentService.createTextOutput(
      JSON.stringify({
        result: "success",
        message: message
      })
    ).setMimeType(ContentService.MimeType.JSON);
  }

  /**
   * エラーレスポンスを作成
   */
  static createErrorResponse(message) {
    return ContentService.createTextOutput(
      JSON.stringify({
        result: "error",
        message: message
      })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}
