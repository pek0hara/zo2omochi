/**
 * メンション処理クラス
 * グループチャットでのメンション関連処理を担当
 */
class MentionProcessor {
  
  /**
   * Botへのメンションを除去してテキストを取得
   */
  static removeBotMentions(message, botUserId) {
    if (!message.mention || !message.mention.mentionees || message.mention.mentionees.length === 0) {
      return message.text.trim();
    }

    const textParts = [];
    let lastIndex = 0;
    
    // メンション情報をindexでソート
    const sortedMentions = message.mention.mentionees
      .slice()
      .sort((a, b) => a.index - b.index);

    sortedMentions.forEach(mention => {
      if (mention.userId === botUserId) {
        // Botへのメンションの前の部分を追加
        if (mention.index > lastIndex) {
          textParts.push(message.text.substring(lastIndex, mention.index));
        }
        // メンション部分をスキップしてlastIndexを更新
        lastIndex = mention.index + mention.length;
      }
    });
    
    // 最後のメンションの後の部分を追加
    if (lastIndex < message.text.length) {
      textParts.push(message.text.substring(lastIndex));
    }
    
    // Botへのメンションが一つでもあった場合、textPartsを結合
    // そうでなければ元のテキストを使用
    if (message.mention.mentionees.some(m => m.userId === botUserId)) {
      return textParts.join('').trim();
    } else {
      return message.text.trim();
    }
  }
}
