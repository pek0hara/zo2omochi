/**
 * トリガー管理クラス
 * Google Apps Scriptのトリガー設定を管理
 */
class TriggerManager {
  
  /**
   * 1時間ごとのトリガーを設定
   */
  static setupHourlyTrigger() {
    try {
      // 既存のトリガーを削除
      this.deleteExistingTriggers('pushToNotionHourly');
      this.deleteExistingTriggers('pushToNotionDaily'); // 古いトリガーも削除

      // 新しい1時間ごとのトリガーを作成
      ScriptApp.newTrigger('pushToNotionHourly')
        .timeBased()
        .everyHours(1)
        .create();

      Logger.log("1時間ごとのトリガーを設定しました。");
    } catch (error) {
      Logger.log("Error in setupHourlyTrigger: " + error.message);
      ErrorLogger.log("setupHourlyTrigger Error", error.message);
    }
  }

  /**
   * 日次トリガーを設定（後方互換性のため）
   */
  static setupDailyTrigger() {
    try {
      // 既存のトリガーを削除
      this.deleteExistingTriggers('pushToNotionDaily');

      // 日次トリガーを作成
      ScriptApp.newTrigger('pushToNotionDaily')
        .timeBased()
        .everyDays(1)
        .atHour(23) // 23時に実行
        .create();

      Logger.log("日次トリガーを設定しました。");
    } catch (error) {
      Logger.log("Error in setupDailyTrigger: " + error.message);
      ErrorLogger.log("setupDailyTrigger Error", error.message);
    }
  }

  /**
   * 指定した関数名のトリガーを削除
   */
  static deleteExistingTriggers(functionName) {
    const triggers = ScriptApp.getProjectTriggers();
    triggers.forEach(trigger => {
      if (trigger.getHandlerFunction() === functionName) {
        ScriptApp.deleteTrigger(trigger);
        Logger.log(`削除されたトリガー: ${functionName}`);
      }
    });
  }

  /**
   * 現在のトリガー状況を確認
   */
  static checkCurrentTriggers() {
    const triggers = ScriptApp.getProjectTriggers();
    Logger.log("現在のトリガー一覧:");
    
    triggers.forEach(trigger => {
      const functionName = trigger.getHandlerFunction();
      const triggerType = trigger.getTriggerSource();
      const eventType = trigger.getEventType();
      
      Logger.log(`- 関数: ${functionName}, タイプ: ${triggerType}, イベント: ${eventType}`);
    });

    return triggers.map(trigger => ({
      functionName: trigger.getHandlerFunction(),
      triggerType: trigger.getTriggerSource(),
      eventType: trigger.getEventType()
    }));
  }

  /**
   * 全てのトリガーを削除
   */
  static deleteAllTriggers() {
    const triggers = ScriptApp.getProjectTriggers();
    triggers.forEach(trigger => {
      ScriptApp.deleteTrigger(trigger);
    });
    Logger.log(`${triggers.length}個のトリガーを削除しました。`);
  }
}
