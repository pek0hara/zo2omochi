/**
 * ユーザー管理クラス
 * ユーザー情報の管理を担当
 */
class UserManager {
  
  /**
   * ユーザーの表示名を取得
   */
  static getDisplayName(userId) {
    try {
      const userMap = Config.getUserMap();
      return userMap[userId] || "";
    } catch (error) {
      Logger.log("Error in getDisplayName: " + error.message);
      return "";
    }
  }

  /**
   * ユーザーの名前を設定
   */
  static setUserName(userId, newName) {
    try {
      const userMap = Config.getUserMap();
      userMap[userId] = newName;
      Config.setUserMap(userMap);
    } catch (error) {
      Logger.log("Error in setUserName: " + error.message);
      ErrorLogger.log("setUserName Error", error.message);
    }
  }

  /**
   * 全てのユーザー情報を取得
   */
  static getAllUsers() {
    try {
      return Config.getUserMap();
    } catch (error) {
      Logger.log("Error in getAllUsers: " + error.message);
      return {};
    }
  }
}
