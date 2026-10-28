import { resolveUiLocale } from './index';

// English, Japanese, Simplified Chinese, Traditional Chinese.
const messages = {
  noDue: ['No words due for review', '復習予定の単語はありません', '目前没有待复习的单词', '目前沒有待複習的單字'],
  noCards: ['No saved words yet', '保存した単語はまだありません', '还没有收藏的单词', '還沒有收藏的單字'],
  noDueDesc: ['Come back when words are due, or browse your saved words.', '次の復習日を待つか、保存した単語を確認できます。', '下次到期时再回来复习，或查看所有收藏。', '下次到期時再回來複習，或查看所有收藏。'],
  noCardsDesc: ['Save a word from subtitles or add one in My words.', '字幕の単語を保存するか、単語帳で追加してください。', '在字幕中收藏单词，或在我的单词中添加。', '在字幕中收藏單字，或在我的單字中新增。'],
  goWords: ['Go to My words', '単語帳へ', '前往我的单词', '前往我的單字'],
  completed: ['Completed', '完了', '已完成', '已完成'],
  reviewComplete: ['Review complete', '復習が完了しました', '本轮复习完成', '本輪複習完成'],
  reviewSaved: ['Your ratings were saved and the next review dates updated.', '評価が保存され、次の復習日が更新されました。', '评分已保存，下次复习日期已更新。', '評分已儲存，下次複習日期已更新。'],
  again: ['Again', 'もう一度', '生疏', '生疏'], hard: ['Hard', '難しい', '困难', '困難'], good: ['Good', '良い', '良好', '良好'], easy: ['Easy', '簡単', '容易', '容易'],
  backWords: ['Back to My words', '単語帳に戻る', '返回我的单词', '返回我的單字'],
  counter: ['Card {{current}} / {{total}}', '{{current}} / {{total}} 枚', '第 {{current}} / {{total}} 张', '第 {{current}} / {{total}} 張'],
  word: ['Word', '単語', '单词', '單詞'], flipHint: ['Press SPACE to flip', 'SPACE キーでめくる', '按 SPACE 翻面', '按 SPACE 翻面'],
  speakShortcut: ['Play pronunciation (V)', '発音を再生 (V)', '朗读发音 (V)', '朗讀發音 (V)'], speak: ['Pronunciation (V)', '発音 (V)', '发音 (V)', '發音 (V)'],
  endReview: ['End review', '復習を終了', '结束复习', '結束複習'], reveal: ['Show answer', '答えを見る', '查看答案', '點擊看答案'],
  revealHint: ['Click the card or press Space to reveal the meaning.', 'カードをクリックするかスペースキーで意味を表示。', '点击卡片或按空格键查看释义。', '點擊卡片或按空白鍵揭開釋義。'],
  answer: ['Answer', '答え', '答案', '答案'], gradeHint: ['Choose a rating below or press 1–4.', '下の評価か 1〜4 キーを選んでください。', '选择下方评分或按 1–4。', '選擇下方評分或按 1–4。'],
  flipButton: ['Show meaning (Space / Enter)', '意味を見る (Space / Enter)', '查看释义（空格 / Enter）', '查看釋義（空白鍵 / Enter）'],
  details: ['Word details', '単語の詳細', '单词资料', '單字資料'], reviewCount: ['Reviewed {{count}} times', '復習回数 {{count}}', '已复习 {{count}} 次', '已複習 {{count}} 次'],
  lemma: ['Lemma', '原形', '原形', '原形'], pos: ['Part of speech', '品詞', '词性', '詞性'], notTagged: ['Not specified', '未設定', '未标注', '未標註'],
  tags: ['Tags', 'タグ', '收藏标签', '收藏標籤'], watchVideo: ['Watch video · {{time}}', '動画を見る · {{time}}', '回看视频 · {{time}}', '回看影片 · {{time}}'],
  viewSource: ['View source', '元のページを見る', '查看原始出处', '查看原始出處'], systemVoice: ['Read aloud', '音声で読み上げ', '使用系统语音朗读', '使用系統語音朗讀'],
  copy: ['Copy Markdown card', 'Markdown カードをコピー', '复制 Markdown 单词卡', '複製 Markdown 單字卡'], copied: ['✓ Markdown copied', '✓ Markdown をコピーしました', '✓ 已复制 Markdown', '✓ 已複製 Markdown'],
  copyFailed: ['Copy failed. Allow clipboard access and try again.', 'コピーできませんでした。クリップボードへのアクセスを許可してください。', '复制失败，请允许剪贴板访问。', '複製失敗，請允許剪貼簿存取。'],
  shortcuts: ['Keyboard shortcuts', 'キーボードショートカット', '键盘快捷键', '鍵盤快捷鍵'], flip: ['Flip card', 'カードをめくる', '翻转卡片', '翻轉卡片'],
  speakWord: ['Play pronunciation', '単語の発音', '朗读单词', '單字語音朗讀'], grades: ['Again / Hard / Good / Easy', 'もう一度 / 難しい / 良い / 簡単', '生疏 / 困难 / 良好 / 容易', '生疏 / 困難 / 良好 / 容易'],
  days: ['In {{count}} days', '{{count}} 日後', '{{count}} 天后', '{{count}} 天後'],
  audioUnsupported: ['Speech is not supported in this browser.', 'このブラウザーは音声読み上げに対応していません。', '此浏览器不支持朗读。', '這個瀏覽器不支援朗讀。'],
  audioFailed: ['Could not play speech. Check your system voices.', '読み上げに失敗しました。システム音声を確認してください。', '朗读失败，请检查系统语音。', '朗讀失敗，請檢查系統語音。'],
  reviewFailed: ['Your rating was not saved. Please try again.', '評価を保存できませんでした。もう一度お試しください。', '评分未保存，请重试。', '尚未儲存這次評分，請再按一次重試。'],
  meaning: ['Meaning', '意味', '释义', '釋義'], example: ['Example', '例文', '例句', '例句'], translation: ['Translation', '訳文', '译文', '譯文'],
  wordsTitle: ['Saved words', '保存した単語', '收藏清单', '收藏清單'], wordsDesc: ['No words saved yet. Select a word on a page or in subtitles to save it.', 'まだ単語はありません。ページや字幕から単語を保存してください。', '还没有保存单词。可在网页或字幕中选择单词收藏。', '尚未儲存單字。可在網頁或字幕中選擇單字收藏。'],
  wordCount: ['{{count}} words', '{{count}} 語', '{{count}} 个单词', '{{count}} 個單字'], dueCount: ['{{count}} due', '{{count}} 語が復習予定', '{{count}} 待复习', '{{count}} 待複習'],
  reviewWords: ['Review words', '単語を復習', '复习单词', '複習單字'], exportAnki: ['Export Anki', 'Anki に書き出す', '导出 Anki', '匯出 Anki'],
  exportAnkiTitle: ['Export an Anki deck (.txt)', 'Anki デッキを書き出す (.txt)', '导出 Anki 牌组 (.txt)', '匯出 Anki 牌組 (.txt)'], exportCsv: ['Export CSV', 'CSV を書き出す', '导出 CSV', '匯出 CSV'],
  clearAll: ['Clear all', 'すべて削除', '清空词库', '清空字庫'], termPlaceholder: ['Word, e.g. apple', '単語（例：apple）', '单词，例如 apple', '單字，例如 apple'],
  meaningPlaceholder: ['Meaning, e.g. fruit', '意味（例：りんご）', '意思，例如 苹果', '意思，例如 蘋果'], add: ['Add word', '単語を追加', '新增单词', '新增單字'],
  search: ['Search words, meanings or examples…', '単語・意味・例文を検索…', '搜索单词、意思或例句…', '搜尋單字、意思或例句…'],
  noResults: ['No words match “{{query}}”.', '「{{query}}」に一致する単語はありません。', '找不到符合“{{query}}”的单词。', '找不到符合「{{query}}」的單字。'],
  interval: ['Review interval: {{count}} days', '復習間隔：{{count}} 日', '复习间隔：{{count}} 天', '複習間隔：{{count}} 天'],
  openSource: ['Open source page', '元のページを開く', '打开原始网页', '開啟原始網頁'], delete: ['Delete this word', 'この単語を削除', '删除这个单词', '刪除這個單字'],
  saveFailed: ['Not saved. Your input is preserved; please try again.', '保存できませんでした。入力内容は保持されています。', '未保存，输入内容已保留，请重试。', '尚未儲存，輸入的內容已保留。請再試一次。'],
  themeReadFailed: ['Could not load appearance settings. Reopen the extension.', '外観設定を読み込めませんでした。拡張機能を開き直してください。', '无法读取外观设置，请重新打开扩展。', '無法讀取外觀設定，請重新開啟擴充功能。'],
  themeSaveFailed: ['Appearance settings were not saved. Please try again.', '外観設定を保存できませんでした。もう一度お試しください。', '外观设置未保存，请重试。', '外觀設定未儲存，請再試一次。'],
  lookup: ['Click to look up', 'クリックして調べる', '点击查询', '點擊查詢'],
  chromeTabRequired: ['Open a webpage to use Chrome on-device AI.', 'Chrome オンデバイス AI を使用するにはウェブページを開いてください。', '请先打开网页以使用 Chrome 本地 AI。', '請先開啟網頁以使用 Chrome 本機 AI。'],
  chromeNoResponse: ['Chrome on-device AI did not respond.', 'Chrome オンデバイス AI が応答しませんでした。', 'Chrome 本地 AI 没有响应。', 'Chrome 本機 AI 沒有回應。'],
} satisfies Record<string, [string, string, string, string]>;

export type LearningKey = keyof typeof messages;
export function learningText(preference: string | undefined, key: LearningKey, vars?: Record<string, string | number>): string {
  const locale = resolveUiLocale(preference);
  const index = locale === 'ja' ? 1 : locale === 'zh-Hans' ? 2 : locale === 'zh-Hant' ? 3 : 0;
  let result: string = messages[key][index];
  for (const [name, value] of Object.entries(vars ?? {})) result = result.replaceAll(`{{${name}}}`, String(value));
  return result;
}
