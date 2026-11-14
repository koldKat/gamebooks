// Keep the printed duel's labels Bulgarian regardless of the application language.
const labels = {
  title:'Последната битка', strength:'Сила', energy:'Енергия', player:'Ерик', enemy:'Противник',
  method:'Начин на двубой', extended:'Продължителна битка', quick:'Кратка битка',
  rules:'Въведи текущата сила и енергия. Избери вариант на Отар от предложенията или въведи свой противник. Разликата в силите намалява енергията на по-слабия веднъж, преди първия удар.',
  continueReader:'Продължи в четеца и приложи указаните там промени в славата. Симулаторът не мести героя по картата.',
  start:'Начало на двубоя', roll:'Хвърли заровете', cancel:'Прекрати двубоя',
  cancelConfirm:'Да прекратя ли двубоя? Не се записва победа или загуба.',
  invalid:'Провери показателите и дали двубоят още е активен.', ready:'Готов за двубой.',
  adjustment:'Енергия след сравняване на силите', round:'Удар', damage:'Загубена енергия',
  win:'Победа', loss:'Загуба', rescued:'Торвалд те спасява', dead:'Смърт', section:'Епизод', history:'Предишни двубои',
};
export default Object.fromEntries(Object.entries(labels).map(([key, value]) => ['battlesim731.' + key, value]));
