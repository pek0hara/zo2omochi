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
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;
      
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
      timestamp: new Date().toISOString()
    };

    try {
      console.log('Gemini APIレスポンステストを開始します...');
      
      const startTime = new Date().getTime();
      const testMessage = "こんにちは";
      const testPrompt = "簡潔に挨拶を返してください。";
      
      const response = this.getMessage(testMessage, testPrompt);
      const endTime = new Date().getTime();
      
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
