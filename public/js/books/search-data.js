// Match lazy library groups from their metadata without constructing book cards.
import { foldForSearch } from '../core/sort.js';

export function createBookSearchIndex() {
  const texts = new WeakMap();
  return records => query => records.some(record => {
    let text = texts.get(record);
    if (text === undefined) {
      text = foldForSearch([record.name, record.authors, record.description, record.series_name].filter(Boolean).join(' '));
      texts.set(record, text);
    }
    return text.includes(query);
  });
}
