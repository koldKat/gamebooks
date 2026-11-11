import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createBookSearchIndex} from '../../../public/js/books/search-data.js';

test('lazy groups match book titles, authors, descriptions and series without rendering cards',()=>{
  const index=createBookSearchIndex();
  const group=index([{name:'Златният печат',authors:'Автор',description:'Ancient fortress',series_name:'Quest'}, {name:'Other book'}]);
  for(const query of ['златният','автор','ancient fortress','quest'])assert.equal(group(query),true);
  assert.equal(group('unrelated'),false);
  assert.equal(index([{name:'Favorite stash'}])('favorite'),true);
});

test('new render indexes see edited metadata and shared records remain searchable in multiple groups',()=>{
  const book={name:'Before',description:'Original'};
  const index=createBookSearchIndex(),first=index([book]),second=index([{name:'Series'},book]);
  assert.equal(first('before'),true);assert.equal(second('original'),true);
  book.name='After';book.description='Updated';
  assert.equal(createBookSearchIndex()([book])('updated'),true);
  assert.equal(createBookSearchIndex()([book])('before'),false);
});
