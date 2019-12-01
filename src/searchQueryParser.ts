import { partition, flatten } from "./util";

/**
 * Return quote char in terminal of each platform
 *
 * @returns {string}
 */
function getQuoteChar() : string {
  return process.platform === 'win32' ? '"' : '\'';
}

/**
 * Build search commands.
 * A structure of returning `searchCommands` is following:
 * First layer of array is "or-set".
 * Second layer of array is "and-set".
 * So, we can arbitary conditions except "not" with this structure.
 * @param rawQuery raw search query text
 */
function getSearchCommand(rawQuery: string) : string[][] {
  const q = getQuoteChar();
  
  const targetExts = ["md", "markdown", "mdown", "mkdn"].concat(["txt"]);
  const options = ["-0", "--no-line-number", "--no-heading", "-i", `-g ${q}*.{${targetExts.join(",")}}${q}`];
  const tagPrefix = "#";
  
  const words = rawQuery.split(/\s+/).filter(s => s);
  if(!words.length) { return []; }
  
  const [tagWords, keyWords] = partition(words, (w => w.charAt(0) === tagPrefix));
  
  // タグはOR検索(|で繋いで一度に検索する)
  const tagSearchCommands =
    tagWords.length ?
      [`rg ${options.join(" ")} '^tags\\s*:\\s*\\[[^\\]]*(${tagWords.map(t => t.substring(1)).join("|")})[^\\]]*\\]$'`] :
      [];
  // rg  'hoge'

  // キーワードはAND検索
  const keyWordCommands =
    keyWords.length ? keyWords.map(keyWord => `rg ${options.join(" ")} '${keyWord}'`) : [];
  
  const fileSearchCommands = tagSearchCommands.concat(keyWordCommands);
  
  // ファイル名にマッチさせたい = globで検索して，結合する．GLOBでANDは難しいので，各wordで検索した結果のLISTを結合が必要
  
  const fileMatchCommands =
    keyWords.length ?
      keyWords.map(keyWord => `rg --files -i --glob-case-insensitive -g ${q}*${keyWord}*.{${targetExts.join(",")}}${q}`) : [];
  
  return [fileSearchCommands, fileMatchCommands];
}

/**
 * Parse given query text, and return flattened, "or-set"-indexed commands
 * @param rawQuery raw search query
 */
export function getFlattenedSearchCommands(rawQuery: string) {
  return flatten(getSearchCommand(rawQuery).map((commands, index) => commands.map(commandText => ({ commandText, index }))));
}
