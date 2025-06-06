/**
 * Gemini API クラス
 * Google Gemini APIとの通信を担当
 */
class GeminiAPI {
  
  /**
   * Gemini APIからメッセージを取得
   */
  static getMessage(messageText, prompt) {
    try {
      const apiKey = Config.getGeminiApiKey();
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
      
      const payload = {
        contents: [{
          parts: [{
            text: messageText + prompt
          }]
        }]
      };

      const options = {
        method: "POST",
        contentType: "application/json",
        payload: JSON.stringify(payload)
      };

      const response = UrlFetchApp.fetch(url, options);
      const data = JSON.parse(response.getContentText());

      if (data.candidates && 
          data.candidates[0] && 
          data.candidates[0].content && 
          data.candidates[0].content.parts && 
          data.candidates[0].content.parts[0]) {
        return data.candidates[0].content.parts[0].text;
      } else {
        Logger.log("Gemini API response format unexpected: " + JSON.stringify(data));
        return "申し訳ございません、現在応答できません。";
      }
    } catch (error) {
      Logger.log("Error in getGeminiMessage: " + error.message);
      ErrorLogger.log("Gemini API Error", error.message);
      return "エラーが発生しました。";
    }
  }

  /**
   * Gemini APIのレスポンステスト
   * @return {Object} テスト結果のオブジェクト
   */
  static testResponse() {
    const testResults = {
      success: false,
      responseTime: 0,
      responseText: '',
      error: null,
      timestamp: Config.getNow().toISOString()
    };

    try {
      console.log('Gemini APIレスポンステストを開始します...');
      
      const startTime = Config.getNow().getTime();
      const testMessage = "こんにちは";
      const testPrompt = "簡潔に挨拶を返してください。";
      
      const response = this.getMessage(testMessage, testPrompt);
      const endTime = Config.getNow().getTime();
      
      testResults.responseTime = endTime - startTime;
      testResults.responseText = response;
      testResults.success = response && !response.includes("エラーが発生しました") && !response.includes("現在応答できません");
      
      console.log(`テスト完了 - 成功: ${testResults.success}, 応答時間: ${testResults.responseTime}ms`);
      console.log(`レスポンス: ${response}`);
      
    } catch (error) {
      testResults.error = error.message;
      testResults.success = false;
      Logger.log("テストエラー: " + error.message);
      ErrorLogger.log("Gemini API Test Error", error.message);
    }

    return testResults;
  }
}

// =================================
// GAS実行用関数（スクリプトエディタから実行可能）
// =================================

/**
 * Gemini API基本レスポンステスト
 * スクリプトエディタから実行して疎通確認に使用
 */
function testGeminiResponse() {
  console.log('=== Gemini API レスポンステスト開始 ===');
  
  const result = GeminiAPI.testResponse();
  
  console.log('=== テスト結果 ===');
  console.log(`成功: ${result.success}`);
  console.log(`応答時間: ${result.responseTime}ms`);
  console.log(`レスポンス: ${result.responseText}`);
  if (result.error) {
    console.log(`エラー: ${result.error}`);
  }
  console.log(`実行時刻: ${result.timestamp}`);
  
  return result;
}
