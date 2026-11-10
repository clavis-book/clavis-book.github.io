// Строки интерфейса на английском — черновой перевод: носитель языка его ещё не проверял, на странице об этом
// есть пометка. Ключи — как в ru.js; {имя} — место для числа или слова, его не трогать. Строки, которых здесь
// нет, приложение показывает по-русски. Строки «миссия.…» не переводятся: миссии пока только на русском.
// Первую и последнюю строки не трогать; между ними — обычный текст. Правила разметки — content/README.md.
App.ui(String.raw`
---
что: строки интерфейса
язык: en
статус: не проверено носителем
перевод с: 09.11.2026
---
название: Key & Lock
подзаголовок: an information security textbook and practicum
путь: Path through the textbook
скоро: coming soon

шапка.к-содержанию: Skip to content
шапка.меню: App sections
шапка.студенту: Students
шапка.преподавателю: Teachers
шапка.проектор: Projector
шапка.язык: Language
шапка.тема.auto: Theme: system
шапка.тема.light: Theme: light
шапка.тема.dark: Theme: dark
шапка.группой: Group mode
шапка.группой.пояснение: Large text and letters on answer options — for a class at a shared screen
шапка.черновой-перевод: Draft interface translation: not yet checked by a native speaker.

вход.заголовок: Key & Lock
вход.текст: A textbook and practicum on information security: the course “Cryptographic Methods of Information Protection” and topics beyond it. Each section goes in steps — from “Simply” with everyday examples to “Deeper” at university level, with models, questions and game missions.
вход.студенту: Students
вход.студенту-текст: Section map, steps, questions with explanations and the “Kilt Bureau” mission in section 11
вход.преподавателю: Teachers
вход.преподавателю-текст: Dashboard: groups, collecting work, rubric checking, summary
вход.проектор: Projector mode
вход.проектор-текст: Large model, question of the day and class stages for a shared screen
вход.устройство: Progress, answers and the card collection are stored only in this browser, without a name. The textbook needs no internet.
вход.модель: Content model — for text authors
вход.к-карте: To the section map
ошибки.баннер: The textbook texts contain errors: {n}.
ошибки.смотреть: See where and what to fix

карта.заголовок: Section map
карта.текст: Sections open in any order; the path “from scratch” follows the numbers. Section 11 is ready first — a good place to start.
карта.пройдено: done
карта.впереди: ahead
карта.отметки: marks — Simply, Try it, Deeper, Check yourself
карта.плитка: Section {n}: {название}. Steps marked: {отмечено} of 4
карта.флагман: ready first
карта.коллекция: Collection on this device
карта.коллекция-текст: Cards: {карточек}, awards: {наград}. The collection is shared by the whole textbook and stored only in this browser, without a name.
карта.стереть: Erase progress and collection on this device
карта.стереть-точно: Really erase? Press again

раздел.номер: Section {n}
раздел.лекция: lecture {n}
раздел.лекции: lectures {n}
раздел.все-лекции: all lectures
ступени.меню: Section steps
ступень.prosto: Simply
ступень.poprobuy: Try it
ступень.glubzhe: Deeper
ступень.proverka: Check yourself
ступень.doma: At home
ступень.prepod: For teachers
ступень.минут: ≈ {n} min
ступень.нет-плана: This step will appear later.
ступень.перевод-устарел: translation out of date
ступень.нет-перевода: no translation yet — showing the Russian text
ступень.перевод-черновой: The translation is a draft and may be incomplete.
ступень.читать-по-русски: Read in Russian
ступень.вернуть-перевод: Back to the translation
ступень.готово-дальше: Done — next: {ступень}

ист.заголовок: Sources
ист.номер: Source {n}
ист.проверить: [to check]
ист.не-сверено: Source not yet verified
ист.что-сверить: To verify: {что}
ист.нет: Source “{код}” is not in the source list
ист.сверено: verified {когда}
ист.что-сверено: What was verified
ссылка.наружу: (opens in a new tab, needs internet)
выноска.заметка: Note
интерактив.нет: The “{имя}” interactive is not ready yet.

радио.заголовок: Who will receive your message?
радио.пример: Meet at five
радио.квартира: your flat
радио.подпись-стена: wall
радио.роутер: router
радио.ты: you
радио.сосед: neighbour
радио.место.комната: in this room
радио.место.стена: behind the wall
радио.место.парковка: in the car park
радио.место.квартал: in the next block
радио.схема-в-зоне: Diagram: the router in the flat and the neighbour's phone {где} — within signal range
радио.схема-вне-зоны: Diagram: the router in the flat and the neighbour's phone {где} — out of signal range
радио.где: Where the neighbour's phone is
радио.включить: Turn on encryption (WPA2 or WPA3)
радио.твоё: Your message (this is a model: it is not sent anywhere)
радио.принял: The neighbour's phone received:
радио.ничего: Nothing: the signal hardly reaches this far.
радио.условно: The diagram is schematic: real range depends on the router, walls and interference.
радио.открыто: Without encryption the whole message can be read — even {где}.
радио.закрыто: The neighbour gets only meaningless symbols: without the key they cannot recover “{текст}”. This is an illustration: the symbols here are random, and real WPA2 encryption is more complex.

повтор.заголовок: Repeating one-time values
повтор.16: 16 bits
повтор.24: WEP: 24 bits
повтор.32: 32 bits
повтор.длина: Value length:
повтор.бит: bit|bits
повтор.сколько: How many values (packets) were sent:
повтор.вероятность: Probability of a repeat: {p}
повтор.меньше: less than {x}
повтор.вывод: A length of {бит} gives {вариантов} options, yet a repeat becomes more likely than not after only {порог} values.
повтор.график: Chart: probability of at least one repeat depending on the number of values
повтор.ось: number of values n (logarithmic scale)
повтор.наведи: Hover over the chart to see the probability for any n.
повтор.точка: n = {n} → probability ≈ {p}
повтор.всего: Total options N
повтор.половина: Even odds at n
повтор.случайно: Here the values are picked at random. A counter that adds one each time never repeats under the same key.

сортировка.нет: Sorting needs a step file with cases.
сортировка.заголовок: Sort into baskets: {корзины}
сортировка.счёт: Correct: {верно} of {всего}
сортировка.верно: Correct.
сортировка.мимо: Not quite: the right answer is “{ответ}”.
сортировка.ответ: Answer for case {n}

вопрос.номер: Question {n} of {всего}
вопрос.проверить: Check
вопрос.подсказка: Hint
вопрос.ещё-подсказка: Another hint
вопрос.показать-решение: Show the solution
вопрос.подсказка-н: Hint {n}.
вопрос.лестница: Hint ladder
вопрос.ещё-раз: Try again or take a hint.
вопрос.верно: Correct!
вопрос.верно-не-сразу: Correct, though not on the first try.
вопрос.верно-подсказка: Correct, with a hint.
вопрос.решение-показано: Solution shown: the question counts as “with a hint”.
вопрос.источники: Sources:
вопрос.назад: Back
вопрос.дальше: Next question
вопрос.итог: Right away: {сразу}, not right away: {несразу}, with a hint: {подсказка}

миссии.карточка-метка: Mission
миссии.начать: Start the mission
миссии.снова: Play again
миссии.пройдена: completed
миссии.только-русский: The mission is in Russian only for now.

преподавателю.заголовок: For teachers
преподавателю.текст: The teacher's dashboard will be here: groups, collecting work, rubric checking and a summary. It will appear later.
проектор.заголовок: Projector mode
проектор.текст: A mode for a shared screen will be here: a large model, question of the day and class stages with a timer. It will appear later. For now, use the “Group mode” button in the top bar.
нет.заголовок: No such page
нет.на-вход: To the home page
`);
