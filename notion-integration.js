/**
 * Notion連携クラス
 * Notionとの連携機能を担当
 */
class NotionIntegration {
  
  /**
   * 1時間ごとのNotion連携
   */
  static pushToNotionHourly() {
    try {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const todayStart = new Date(today.getTime());
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      
      const sheet = MessageHistory.getMainSheet();
      const data = sheet.getDataRange().getValues();

      // 日付変更時（0時台）に前日の記事を最終更新
      if (now.getHours() === 0) {
        Logger.log("日付変更を検知しました。前日記事の最終更新を実行します。");
        this.finalizePreviousDayArticle(yesterday, data);
      }

      // 今日の変更を確認して処理
      this.processHourlyUpdate(todayStart, data);
      
    } catch (error) {
      Logger.log("Error in pushToNotionHourly: " + error.message);
      ErrorLogger.log("pushToNotionHourly Error", error.message);
    }
  }

  /**
   * 前日の記事を最終更新
   */
  static finalizePreviousDayArticle(yesterday, allData) {
    try {
      const yesterdayStart = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
      const yesterdayEnd = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59, 999);

      // 前日のエントリを抽出
      const yesterdayEntries = allData.slice(1).filter(row => {
        const timestamp = new Date(row[0]);
        return timestamp >= yesterdayStart && timestamp <= yesterdayEnd;
      });

      if (yesterdayEntries.length === 0) {
        Logger.log("前日のエントリが見つかりません。");
        return;
      }

      // 前日の記事を検索
      const yesterdayPageId = this.findSpecificDateNotionPage(yesterdayStart);
      if (!yesterdayPageId) {
        Logger.log("前日の記事が見つからないため、最終更新をスキップします。");
        return;
      }

      // 記事を更新
      this.updateNotionPage(yesterdayPageId, yesterdayEntries, yesterdayStart, true);
      
    } catch (error) {
      Logger.log("Error in finalizePreviousDayArticle: " + error.message);
      ErrorLogger.log("finalizePreviousDayArticle Error", error.message);
    }
  }

  /**
   * 1時間ごとの更新処理
   */
  static processHourlyUpdate(todayStart, allData) {
    // 実装は元のコードの該当部分を移植
    // 簡略化のため、ここでは基本構造のみ示します
    Logger.log("Hourly update processing...");
  }

  /**
   * Notionページを更新
   */
  static updateNotionPage(pageId, entries, date, isFinal = false) {
    // 実装は元のコードの該当部分を移植
    Logger.log(`Updating Notion page: ${pageId}, entries: ${entries.length}, final: ${isFinal}`);
  }

  /**
   * 特定日付のNotionページを検索
   */
  static findSpecificDateNotionPage(date) {
    // 実装は元のコードの該当部分を移植
    Logger.log(`Finding Notion page for date: ${date}`);
    return null; // 仮の実装
  }

  /**
   * 日次の一括連携（後方互換性のため残す）
   */
  static pushToNotionDaily() {
    Logger.log("Daily push is deprecated. Use pushToNotionHourly instead.");
    this.pushToNotionHourly();
  }
}
