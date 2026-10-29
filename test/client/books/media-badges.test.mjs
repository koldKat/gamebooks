import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const markup = readFileSync(new URL('../../../public/js/books/markup.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace(/^export /gm, '');

test('PDF badges respect book access for initial cards and in-place updates', () => {
  for (const [isAdmin, hasAccess] of [[false,false],[false,true],[true,false]]) {
    const inserted = [], removed = [], attributes = new Map();
    const card = {
      setAttribute: (name,value) => attributes.set(name,value),
      removeAttribute: name => attributes.delete(name),
      querySelector: selector => selector === '.book-pdf-badge' ? { remove: () => removed.push(true) }
        : selector === '.book-name-row' ? { insertAdjacentHTML: (_where,html) => inserted.push(html) } : null,
    };
    const book = { id:42,name:'Book',total_sections:100,visited:0,pdf_path:'pdfs/42.pdf' };
    const context = { booksState:{_cachedBooks:[book],_activeSeriesRuns:[],_hooks:{
      getIsAdmin:()=>isAdmin,getHasPdfAccess:()=>hasAccess}},
      _isMobile:()=>false,escapeHtml:String,t:key=>key,
      _patchCachedBook:(_id,patch)=>Object.assign(book,patch),
      document:{querySelectorAll:()=>[card]} };
    runInNewContext(markup,context);
    const html=context._bookItemHtml(book,false,false,0,null,isAdmin);
    assert.equal(html.includes('book-pdf-badge'),isAdmin||hasAccess);
    context._syncPdfBadgeOnCards(42,'pdfs/new.pdf',123);
    assert.equal(inserted.length,isAdmin||hasAccess?1:0);
    assert.equal(book.pdf_path,'pdfs/new.pdf');
    assert.equal(attributes.get('data-pdf'),'pdfs/new.pdf');
    context._syncPdfBadgeOnCards(42,null);
    assert.equal(attributes.has('data-pdf'),false);
    assert.equal(removed.length,2);
    assert.equal(context._pdfBadgeHtml(null,true),'');
  }
});
