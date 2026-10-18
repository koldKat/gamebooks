// Printed encounters and lookup data for Shadows of Doom.
export const definition = Object.freeze({
  id: 903, title: 'Сенки от Ада', family: 'code-cards',
  stateKey: 'sim903', i18nPrefix: 'battlesim903',
});

// + victory, - wounded, . unresolved; rows A-J, columns 1-5.
export const LOOKUP_ROWS = Object.freeze([".-...","-..+.","..-.+","..+--",".+-.-","+..-.","-.--.","..+..","++-.-",".-.-+"]);

export const SOURCE_IMAGES = Object.freeze({
  "lookup": "/api/books/903/reading-images/943bdf6bbbc1c6a0b054cdab7c8e9b5e4a22946d3752689575e948eee1a5dd5b.png",
  "legend": "/api/books/903/reading-images/d4dbf1f83143fe2c4d6fb69e3069adbc07fd074f81d87fa2d67fd68e13d000e7.png"
});

export const ENCOUNTERS = Object.freeze([
  Object.freeze({"id":"3","strength":6,"win":70,"wounded":142,"displayName":"Демонът с четвъртита глава","room":"Пещерата на ехото","grid":"/api/books/903/reading-images/40f90e840eb9ad9fb183ca82854eb1c2423ce7a6bfb46b3d7b7b2eb8db6f3f13.png"}),
  Object.freeze({"id":"6","strength":5,"win":75,"wounded":110,"displayName":"Огненият демон","room":"Пещерата на огъня","grid":"/api/books/903/reading-images/a4b60dbe726d4adabbb4e467526fd46c19408ab669d0866d06ee49d3890fd437.png"}),
  Object.freeze({"id":"9","strength":6,"win":87,"wounded":131,"displayName":"Първото блатно влечуго","room":"Пещерата на влечугите","grid":"/api/books/903/reading-images/0234244fc01abc6fb51f201b1bb31a59c5034f4a9ab2b8b7bad69fa06c129ee3.png"}),
  Object.freeze({"id":"14","strength":2,"win":96,"wounded":105,"displayName":"Пазителят на първия остров","room":"Езерната пещера","grid":"/api/books/903/reading-images/7a7631e84be149238a4613c3f033146bf26846cf90e589886fe4ab74b9c89af7.png"}),
  Object.freeze({"id":"21","strength":2,"win":125,"wounded":80,"displayName":"Мравкоподобният демон","room":"Пещерата на насекомите","grid":"/api/books/903/reading-images/4ad8ca11c76799f61aca3a36324e07c2f5c6075dd2e4afbddf04b5e6c641fdaf.png"}),
  Object.freeze({"id":"29","strength":1,"win":79,"wounded":145,"displayName":"Демонът с ятагана","room":"Пещерата на мъглите","grid":"/api/books/903/reading-images/b3709624a300060de6e8bb182e39896e723db71da0234d61bcec9ac144d63658.png"}),
  Object.freeze({"id":"33","strength":6,"win":79,"wounded":145,"displayName":"Рогатият демон","room":"Пещерата на мъглите","grid":"/api/books/903/reading-images/bac55234b9dc57bb4bc2564d1937cba48c259747f3544ee0ed5921e6b53e15bb.png"}),
  Object.freeze({"id":"39","strength":6,"win":96,"wounded":105,"displayName":"Пазителят на средния остров","room":"Езерната пещера","grid":"/api/books/903/reading-images/b42ce8dac129f2f52af0eac54899f64ae4892c01dbc708146bc3c86e285137c4.png"}),
  Object.freeze({"id":"46","strength":3,"win":75,"wounded":110,"displayName":"Маймуноподобният демон","room":"Пещерата на огъня","grid":"/api/books/903/reading-images/3e64ca3e2a0cb61a7c7eced261c74a79323e05de35870eb9922a6e7f1bf315f6.png"}),
  Object.freeze({"id":"61","strength":3,"win":87,"wounded":131,"displayName":"Влечугото с раздвоения език","room":"Пещерата на влечугите","grid":"/api/books/903/reading-images/d638be6c9d303ce28b05505c2a2aaab867d57c0b9446e11f7c85ab7b856352d6.png"}),
  Object.freeze({"id":"64","strength":6,"win":79,"wounded":145,"displayName":"Пазителят на смарагда","room":"Пещерата на мъглите","grid":"/api/books/903/reading-images/aaf4dc90e17cceeb9a16f140785662b70ad7ac3a5f54b8353cf0a6c85ad205f6.png"}),
  Object.freeze({"id":"77","strength":6,"win":125,"wounded":80,"displayName":"Паякообразният мутант","room":"Пещерата на насекомите","grid":"/api/books/903/reading-images/71ef6cef22f1fb9d4c4b2991a09e645e33610c323deffa54f344090e0849d06a.png"}),
  Object.freeze({"id":"102","strength":6,"win":125,"wounded":80,"displayName":"Мозъкът с шест крака","room":"Пещерата на насекомите","grid":"/api/books/903/reading-images/aa2167cd866f63fb093394d3290d7f70d721c711bcd71c2c0acc466562a445ec.png"}),
  Object.freeze({"id":"116","strength":1,"win":70,"wounded":142,"displayName":"Биволският демон","room":"Пещерата на ехото","grid":"/api/books/903/reading-images/48c15470d2b5e52baaef1d2129a840f3034395dc63dbf874597e717044a60076.png"}),
  Object.freeze({"id":"122","strength":5,"win":87,"wounded":131,"displayName":"Третото блатно влечуго","room":"Пещерата на влечугите","grid":"/api/books/903/reading-images/0b70e869c96415fc9687c8376ff732d5eea40241f219e246dae3cde68e7f6405.png"}),
  Object.freeze({"id":"128","strength":5,"win":70,"wounded":142,"displayName":"Демонът полузмия","room":"Пещерата на ехото","grid":"/api/books/903/reading-images/f85d6cff2af648912231618137205f2e5f4fcfec2874ca1148f790ea3befae36.png"}),
  Object.freeze({"id":"135","strength":4,"win":75,"wounded":110,"displayName":"Демонът с лъвски зъби","room":"Пещерата на огъня","grid":"/api/books/903/reading-images/761f2015be90bef9e043285c9313bc2e91c2834c45c45cf01eb3cc4dc77d8808.png"}),
  Object.freeze({"id":"144","strength":5,"win":96,"wounded":105,"displayName":"Гигантът на третия остров","room":"Езерната пещера","grid":"/api/books/903/reading-images/faa9aa5355059ba261a7f2e21f8094d58f8640bf80112c8ebd49c9faca8273fc.png"}),
]);

