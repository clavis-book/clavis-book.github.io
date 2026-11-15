// Список источников для страницы учебника. Создан скриптом tools/web_data.py из data/sources.json —
// здесь не править: правьте data/sources.json и запустите скрипт ещё раз.
App.sources({
 "ieee80211_1997": {
  "label": "IEEE 802.11-1997",
  "title": "IEEE Std 802.11-1997. Wireless LAN Medium Access Control (MAC) and Physical Layer (PHY) Specifications (исходный стандарт, в нём WEP)",
  "url": "https://standards.ieee.org/standard/802_11-1997.html",
  "section": "Страница стандарта: утверждён 26.06.1997, опубликован 18.11.1997, статус Superseded",
  "primary": true,
  "verified": true,
  "checked": "26.10.2026"
 },
 "ieee80211i_2004": {
  "label": "IEEE 802.11i-2004",
  "title": "IEEE Std 802.11i-2004. Amendment 6: Medium Access Control (MAC) Security Enhancements",
  "url": "https://standards.ieee.org/ieee/802.11i/3127/",
  "section": "Страница стандарта: утверждён 24.06.2004; определяет TKIP, CCMP, 4-шаговое рукопожатие, использование IEEE 802.1X",
  "primary": true,
  "verified": true,
  "checked": "26.10.2026"
 },
 "ieee80211_2020": {
  "label": "IEEE 802.11-2020 §12.2.1",
  "title": "Ответ рабочей группы IEEE 802.11 на комментарии к P802.11-2020 (цитата §12.2.1)",
  "url": "https://www.ieee802.org/11/Liaisons/2022-08-11-response-to-FDIS%20comments%20on%20P802.11-2020.pdf",
  "section": "§12.2.1: «WEP is obsolete. The WEP algorithm is unsuitable for the purposes of this standard»; TKIP — deprecated. Сверено 09.11.2026: ответ рабочей группы IEEE 802.11 на замечания к FDIS 8802-11 (2022), замечание CN11 с цитатой §12.2.1 принято; «WEP and TKIP must not be used» — WEP объявлен устаревшим, TKIP — нерекомендуемым",
  "primary": true,
  "verified": true,
  "checked": "26.10.2026; 09.11.2026"
 },
 "nist_800_97": {
  "label": "NIST SP 800-97",
  "title": "NIST SP 800-97. Establishing Wireless Robust Security Networks: A Guide to IEEE 802.11i (2007, архивный)",
  "url": "https://nvlpubs.nist.gov/nistpubs/legacy/sp/nistspecialpublication800-97.pdf",
  "section": "§3.2.1: Shared Key — односторонний обмен «запрос — ответ», точка доступа станции себя не доказывает; SSID «is not an access control feature», MAC-адрес не шифруется; §3.2.2: стандарт WEP задавал только 40-битный ключ, 104 + 24 бита IV = 128-битный ключ RC4, способ выбора IV не задан; §3.2.3: CRC-32 защищает только от случайных ошибок, для целостности нужен код с ключом; §4.3: TKIP — для уже выпущенных устройств, обновлением программ, Michael MIC; табл. 4-2: ключ пакета WEP — склейка ключа WEP и 24-битного IV; §4.2.1: парольная фраза, из которой получается PSK, «must be a long and complex, possibly randomly generated»; §5.5.1: после 4-шагового рукопожатия точка доступа и станция взаимно аутентифицированы. Сверено 09.11.2026: §3.2.2, с. 3-5: большинство атак на WEP связаны с IV — по открытому IV, малому пространству IV и слабости в использовании RC4 восстанавливали ключ; WEP точно не задаёт, как выбирать и менять IV, некоторые устройства держат IV постоянным или сбрасывают в ноль; «If two messages have the same IV, and the plaintext of either message is known», второе читается без труда; даже при IV-счётчике: меньше 17 млн значений IV, на загруженной сети они могут кончиться за несколько часов; при случайном выборе вероятность повтора 50 % — примерно после 2¹² кадров. §3.2.3: CRC-32 не защищает от подмены битов, шифрование её не спасает. §4.3.2, с. 4-11 и 4-12: CCMP строит одноразовое число из 48-битного номера пакета (PN); новый временный ключ на каждом сеансе",
  "primary": true,
  "verified": true,
  "checked": "27.10.2026; 09.11.2026",
  "note": "Выведен из обращения 31.12.2025 как устаревший (https://csrc.nist.gov/pubs/sp/800/97/final); цитируется как исторический документ о WEP и 802.11i"
 },
 "ieee80211w_2009": {
  "label": "IEEE 802.11w-2009",
  "title": "IEEE Std 802.11w-2009. Amendment 4: Protected Management Frames",
  "url": "https://standards.ieee.org/ieee/802.11w/3736/",
  "section": "Защита служебных кадров (PMF); утверждён 11.09.2009, сейчас входит в общий стандарт",
  "primary": true,
  "verified": true,
  "checked": "26.10.2026"
 },
 "rfc_2104": {
  "label": "RFC 2104",
  "title": "RFC 2104. HMAC: Keyed-Hashing for Message Authentication (1997)",
  "url": "https://www.rfc-editor.org/rfc/rfc2104",
  "section": "§2: H(K XOR opad, H(K XOR ipad, text)); ключ длиннее блока сначала хешируется",
  "primary": true,
  "verified": true,
  "checked": "26.10.2026"
 },
 "rfc_4231": {
  "label": "RFC 4231",
  "title": "RFC 4231. Identifiers and Test Vectors for HMAC-SHA-224, HMAC-SHA-256, HMAC-SHA-384, and HMAC-SHA-512 (2005)",
  "url": "https://www.rfc-editor.org/rfc/rfc4231",
  "section": "§4: 7 тест-кейсов; кейс 5 усечён до 128 бит",
  "primary": true,
  "verified": true,
  "checked": "26.10.2026"
 },
 "rfc_7465": {
  "label": "RFC 7465",
  "title": "RFC 7465. Prohibiting RC4 Cipher Suites (2015)",
  "url": "https://www.rfc-editor.org/rfc/rfc7465",
  "section": "Запрет наборов шифров RC4 в TLS",
  "primary": true,
  "verified": true,
  "checked": "26.10.2026"
 },
 "wfa_legacy_faq": {
  "label": "Wi-Fi Alliance FAQ «legacy protocols»",
  "title": "Wi-Fi Alliance. What are “legacy protocols”?",
  "url": "https://wi-fi.org/knowledge-center/faq/what-are-legacy-protocols",
  "section": "WEP заменён WPA в 2003 г. как промежуточное решение (TKIP); WPA заменён WPA2 в 2004 г.; покупать только устройства с WPA3. Сверено 09.11.2026: TKIP — «older form of security technology with some vulnerability to cryptographic attacks»; покупать и использовать советуют только устройства с WPA3",
  "primary": true,
  "verified": true,
  "checked": "26.10.2026; 09.11.2026"
 },
 "wfa_wpa2_2006": {
  "label": "Network World 2010",
  "title": "Network World, 06.07.2010. Wi-Fi security in transition (со ссылкой на заявление Wi-Fi Alliance)",
  "url": "https://www.networkworld.com/article/2213316/wi-fi-security-in-transition.html",
  "section": "WPA2 обязательна для Wi-Fi CERTIFIED с 2006 г.; план вывода WEP и TKIP из сертификации на 2011–2014 гг. (в части TKIP выполнен не полностью, см. wfa_tkip_note; исполнение плана для WEP первоисточником не подтверждено — в программе не используется)",
  "primary": false,
  "verified": true,
  "checked": "27.10.2026"
 },
 "wfa_tkip_note": {
  "label": "Wi-Fi Alliance TKIP Note 2015",
  "title": "Wi-Fi Alliance. Technical Note: Removal of TKIP from Wi-Fi Devices, v1.0",
  "url": "https://www.wi-fi.org/system/files/Wi-Fi_Alliance_Technical_Note_TKIP_v1.0.pdf",
  "section": "Сертифицированное устройство не может предлагать режим «только TKIP» в основном интерфейсе; TKIP — устаревшая технология с известными уязвимостями, задуман как переходный механизм для устройств с WEP, не поддерживающих AES; «Wi-Fi Alliance has required WPA2 on all Wi-Fi CERTIFIED products since 2006»",
  "primary": true,
  "verified": true,
  "checked": "27.10.2026"
 },
 "wfa_wpa2_enh": {
  "label": "Wi-Fi Alliance 08.01.2018",
  "title": "Wi-Fi Alliance, 08.01.2018. Wi-Fi Alliance introduces security enhancements",
  "url": "https://www.wi-fi.org/news-events/newsroom/wi-fi-alliance-introduces-security-enhancements",
  "section": "Анонс улучшений WPA2 и будущего WPA3",
  "primary": true,
  "verified": true,
  "checked": "26.10.2026"
 },
 "wfa_wpa3_2018": {
  "label": "Wi-Fi Alliance 25.06.2018",
  "title": "Wi-Fi Alliance, 25.06.2018. Wi-Fi Alliance introduces Wi-Fi CERTIFIED WPA3 security",
  "url": "https://www.wi-fi.org/news-events/newsroom/wi-fi-alliance-introduces-wi-fi-certified-wpa3-security",
  "section": "WPA3-Personal (SAE), WPA3-Enterprise (192-битный режим), обязательный PMF, переходный режим",
  "primary": true,
  "verified": true,
  "checked": "26.10.2026"
 },
 "wpa3_spec": {
  "label": "WPA3 Specification v3.5",
  "title": "Wi-Fi Alliance. WPA3 Specification, Version 3.5 (2025)",
  "url": "https://www.wi-fi.org/system/files/WPA3%20Specification%20v3.5.pdf",
  "section": "§2.2: «только WPA3» — PMF Required; §2.3: переходный режим — PMF Capable; §2.5: TKIP и WEP не используются; 6 ГГц — только WPA3",
  "primary": true,
  "verified": true,
  "checked": "26.10.2026"
 },
 "wpa3_overview": {
  "label": "WPA3 Technology Overview 2021",
  "title": "Wi-Fi Alliance. Wi-Fi CERTIFIED WPA3 Technology Overview (01.2021)",
  "url": "https://www.wi-fi.org/system/files/Wi-Fi_CERTIFIED_WPA3_Technology_Overview_202101.pdf",
  "section": "Обзор WPA3; с 2006 г. устройства Wi-Fi выпускаются с WPA2",
  "primary": true,
  "verified": true,
  "checked": "26.10.2026"
 },
 "wfa_wpa3_mand": {
  "label": "Wi-Fi Alliance, WPA3 Deployment 2026",
  "title": "Wi-Fi Alliance. Driving widespread adoption of WPA3 (WPA3 Deployment Options Highlights, 02.2026)",
  "url": "https://www.wi-fi.org/system/files/WPA3_Deployment_Options_Highlights_202602.pdf",
  "section": "«WPA3 support has been required in all new Wi-Fi CERTIFIED devices since 2020 and its use is mandatory in the 6 GHz band»; переходный режим и вариант с двумя сетями",
  "primary": true,
  "verified": true,
  "checked": "26.10.2026"
 },
 "wfa_security": {
  "label": "Wi-Fi Alliance «Security»",
  "title": "Wi-Fi Alliance. Discover Wi-Fi: Security",
  "url": "https://www.wi-fi.org/discover-wi-fi/security",
  "section": "WPA3 обязательна для Wi-Fi CERTIFIED устройств; Enhanced Open — шифрование в открытых сетях без пароля. Подвал страницы (сверено 14.11.2026): «Wi-Fi®, Wi-Fi CERTIFIED®, Wi-Fi Alliance®… are trademarks of Wi-Fi Alliance» — Wi-Fi — товарный знак Wi-Fi Alliance",
  "primary": true,
  "verified": true,
  "checked": "26.10.2026; 14.11.2026"
 },
 "cisa_m5": {
  "label": "CISA Project Upskill M5",
  "title": "CISA. Project Upskill, Module 5: Home network",
  "url": "https://www.cisa.gov/audiences/high-risk-communities/projectupskill/module5",
  "section": "Безопасны только WPA3 Personal и WPA2 AES; сменить имя сети по умолчанию; длинная фраза-пароль; гостевая сеть; обновления; выключить WPS и удалённое управление",
  "primary": true,
  "verified": true,
  "checked": "26.10.2026"
 },
 "wiki_wep": {
  "label": "Wikipedia: WEP",
  "title": "Wikipedia. Wired Equivalent Privacy (обзор)",
  "url": "https://en.wikipedia.org/wiki/Wired_Equivalent_Privacy",
  "section": "Обзор истории WEP",
  "primary": false,
  "verified": true,
  "checked": "26.10.2026"
 },
 "wiki_wpa": {
  "label": "Wikipedia: WPA",
  "title": "Wikipedia. Wi-Fi Protected Access (обзор)",
  "url": "https://en.wikipedia.org/wiki/Wi-Fi_Protected_Access",
  "section": "Обзор истории WPA, WPA2, WPA3",
  "primary": false,
  "verified": true,
  "checked": "26.10.2026"
 },
 "lecture_14_15_wlan": {
  "label": "Лекция 14–15, «Беспроводные сети»",
  "title": "Лекция 14–15 «Безопасность беспроводных соединений», раздел «Беспроводные сети»",
  "file": "Лекция_14_15_Безопасность_беспроводных_соединений.docx",
  "section": "Радиус действия 802.11x: около 50 м в помещении, до 500 м на открытой местности; WEP: три службы (аутентификация, конфиденциальность, целостность), RC4, ключи «40 бит и 128 бит», CRC-32; аутентификация открытых систем по MAC-адресу; нет обратной аутентификации точки доступа",
  "primary": false,
  "verified": true,
  "kind": "lecture"
 },
 "lecture_14_15_ap": {
  "label": "Лекция 14–15, «Реализация безопасности»",
  "title": "Лекция 14–15 «Безопасность беспроводных соединений», раздел «Реализация безопасности беспроводных сетей»",
  "file": "Лекция_14_15_Безопасность_беспроводных_соединений.docx",
  "section": "Ключ WEP на точке доступа, фильтр MAC-адресов, отключение рассылки SSID, HTTPS и стойкие пароли для управления, размещение точек доступа",
  "primary": false,
  "verified": true,
  "kind": "lecture"
 },
 "lecture_14_15_transfer": {
  "label": "Лекция 14–15, «Безопасность передачи данных»",
  "title": "Лекция 14–15 «Безопасность беспроводных соединений», раздел «Безопасность передачи данных»",
  "file": "Лекция_14_15_Безопасность_беспроводных_соединений.docx",
  "section": "Рекомендация использовать WEP, несмотря на уязвимости; дополнительное шифрование поверх WLAN как недоверенного сегмента",
  "primary": false,
  "verified": true,
  "kind": "lecture"
 },
 "lecture_14_15_site": {
  "label": "Лекция 14–15, «Безопасность сайта»",
  "title": "Лекция 14–15 «Безопасность беспроводных соединений», раздел «Безопасность сайта»",
  "file": "Лекция_14_15_Безопасность_беспроводных_соединений.docx",
  "section": "Отдельный сегмент для WLAN, межсетевой экран между WLAN и внутренней сетью, обнаружение вторжений",
  "primary": false,
  "verified": true,
  "kind": "lecture"
 },
 "moskowitz_2003": {
  "label": "Moskowitz 2003",
  "title": "R. Moskowitz (ICSA Labs), 04.11.2003. Weakness in Passphrase Choice in WPA Interface (копия в рассылке InfoSec News)",
  "url": "https://seclists.org/isn/2003/Nov/21",
  "section": "PSK — 256-битное число (64 hex) или фраза 8–63 байта; цитата 802.11i: ключ из фразы короче ≈ 20 символов вряд ли остановит подбор",
  "primary": false,
  "verified": true,
  "checked": "26.10.2026"
 },
 "nist_800_63b": {
  "label": "NIST SP 800-63B-4 §3.1.1.2",
  "title": "NIST SP 800-63B-4. Digital Identity Guidelines: Authentication and Authenticator Management",
  "url": "https://pages.nist.gov/800-63-4/sp800-63b.html",
  "section": "§3.1.1.2: проверять пароли по списку распространённых, словарных и контекстных; к паролю Wi-Fi применяется по аналогии",
  "primary": true,
  "verified": true,
  "checked": "26.10.2026"
 },
 "cert_vu723755": {
  "label": "CERT VU#723755",
  "title": "CERT/CC Vulnerability Note VU#723755: WiFi Protected Setup (WPS) PIN",
  "url": "https://www.kb.cert.org/vuls/id/723755",
  "section": "Недостаток проектирования метода PIN в WPS; основная мера — выключить WPS",
  "primary": true,
  "verified": true,
  "checked": "26.10.2026"
 },
 "us_cert_ta12_006a": {
  "label": "US-CERT TA12-006A",
  "title": "US-CERT Technical Alert TA12-006A: Wi-Fi Protected Setup (WPS), 06.01.2012 (архив CISA)",
  "url": "https://www.cisa.gov/news-events/alerts/2012/01/06/wi-fi-protected-setup-wps-vulnerable-brute-force-attack",
  "section": "Выключить WPS; на некоторых точках доступа выключение в интерфейсе могло не срабатывать",
  "primary": true,
  "verified": true,
  "checked": "27.10.2026"
 },
 "nsa_home_2023": {
  "label": "NSA Home Network 2023",
  "title": "NSA. Best Practices for Securing Your Home Network (Cybersecurity Information Sheet, 22.02.2023)",
  "url": "https://media.defense.gov/2023/Feb/22/2003165170/-1/-1/0/CSI_BEST_PRACTICES_FOR_SECURING_YOUR_HOME_NETWORK.PDF",
  "section": "WPA3 или WPA2/WPA3; обновления и замена устройств без поддержки; администрирование только из внутренней сети",
  "primary": true,
  "verified": false,
  "checked": "27.10.2026",
  "note": "[проверить]: PDF открывается только скачиванием (ответ 403). Дата (22.02.2023) и темы памятки подтверждены пресс-релизом NSA: https://www.nsa.gov/Press-Room/News-Highlights/Article/Article/3304674/nsa-releases-best-practices-for-securing-your-home-network/ . Сверить по PDF формулировки для правил 7 и 10; у обоих правил есть и проверенные источники (CISA, FBI); пересказы памятки во вторичных источниках совпадают с темами правил 7 и 10"
 },
 "fbi_psa250507": {
  "label": "FBI IC3 PSA 07.05.2025",
  "title": "FBI, Internet Crime Complaint Center (IC3). Public Service Announcement, 07.05.2025: Cyber Criminal Proxy Services Exploiting End of Life Routers",
  "url": "https://www.ic3.gov/PSA/2025/PSA250507",
  "section": "Рекомендации: роутер с истёкшей поддержкой производителя (end of life) заменить новой моделью; сразу устанавливать обновления прошивки; выключить удалённое управление",
  "primary": true,
  "verified": true,
  "checked": "27.10.2026"
 },
 "ieee80211i_2004_h4": {
  "label": "IEEE 802.11i-2004, прил. H.4",
  "title": "IEEE Std 802.11i-2004, Annex H.4: Suggested pass-phrase-to-PSK mapping",
  "url": "https://standards.ieee.org/ieee/802.11i/3127/",
  "section": "H.4.1: парольная фраза — от 8 до 63 символов ASCII с кодами 32–126; примечание: ключ из фразы короче примерно 20 символов вряд ли остановит подбор",
  "primary": true,
  "verified": false,
  "checked": "27.10.2026",
  "note": "[проверить]: текст стандарта доступен только после входа на сайт IEEE. Номер приложения H.4 подтверждает NIST SP 800-97 (§4.2.1, сноска 31); фразу о 20 символах дословно приводят две независимые цитаты 802.11i — Moskowitz 2003 и CWNP «802.11i Authentication and Key Management», 05.2005 (https://www.cwnp.com/uploads/802-11i_key_management.pdf); диапазон 8–63 символа с кодами 32–126 дословно — только CWNP, у Moskowitz пересказ «8 to 63 bytes»; сверено 27.10.2026. Осталось сверить с текстом самого стандарта (в редакции 802.11-2020 — прил. J.4.1, действующая редакция — 802.11-2024; бесплатно через IEEE GET Program после входа)"
 },
 "wfa_pmf": {
  "label": "Wi-Fi Alliance FAQ PMF",
  "title": "Wi-Fi Alliance. What are Protected Management Frames?",
  "url": "https://www.wi-fi.org/faq/what-are-protected-management-frames",
  "section": "PMF защищает одноадресные и групповые служебные кадры действий от подделки",
  "primary": true,
  "verified": true,
  "checked": "26.10.2026"
 },
 "rfc_8110": {
  "label": "RFC 8110 §7",
  "title": "RFC 8110. Opportunistic Wireless Encryption (2017)",
  "url": "https://www.rfc-editor.org/rfc/rfc8110",
  "section": "§7: OWE не аутентифицирует точку доступа",
  "primary": true,
  "verified": true,
  "checked": "26.10.2026"
 },
 "wfa_wpa3_2019": {
  "label": "Wi-Fi Alliance 04.2019",
  "title": "Wi-Fi Alliance, 04.2019. Wi-Fi Alliance security update",
  "url": "https://www.wi-fi.org/news-events/newsroom/wi-fi-alliance-security-update-0",
  "section": "Ошибки в части ранних реализаций WPA3-Personal исправляются обновлениями прошивки",
  "primary": true,
  "verified": true,
  "checked": "26.10.2026"
 },
 "acm_ethics_2018": {
  "label": "ACM Code of Ethics 2018",
  "title": "ACM Code of Ethics and Professional Conduct (2018)",
  "url": "https://www.acm.org/code-of-ethics",
  "section": "Принцип 2.8: пользоваться чужими компьютерами, сетями и данными — только с разрешения; то, что система общедоступна, само по себе разрешением не считается",
  "primary": true,
  "verified": true,
  "checked": "09.11.2026"
 },
 "cert_cvd": {
  "label": "CERT/CC CVD Guide",
  "title": "CERT/CC. The CERT Guide to Coordinated Vulnerability Disclosure, раздел Finder/Reporter",
  "url": "https://certcc.github.io/CERT-Guide-to-CVD/topics/roles/finder/",
  "section": "Отчёт об уязвимости обычно передают производителю, иногда — координатору",
  "primary": true,
  "verified": true,
  "checked": "09.11.2026"
 },
 "cert_vu228519": {
  "label": "CERT/CC VU#228519",
  "title": "CERT/CC Vulnerability Note VU#228519, 16.10.2017: Wi-Fi Protected Access (WPA) handshake traffic can be manipulated to induce nonce and session key reuse",
  "url": "https://www.kb.cert.org/vuls/id/228519",
  "section": "«Wi-Fi Protected Access (WPA) handshake traffic can be manipulated to induce nonce and session key reuse»",
  "primary": true,
  "verified": true,
  "checked": "09.11.2026"
 },
 "ftc_public_wifi": {
  "label": "FTC 02.2023",
  "title": "FTC Consumer Advice. Are Public Wi-Fi Networks Safe? What You Need To Know (02.2023)",
  "url": "https://consumer.ftc.gov/articles/are-public-wi-fi-networks-safe-what-you-need-know",
  "section": "Большинство сайтов и приложений сами шифруют данные, поэтому общественный Wi-Fi обычно безопасен; от поддельного сайта шифрование не защищает",
  "primary": true,
  "verified": true,
  "checked": "09.11.2026"
 },
 "hac_ch6": {
  "label": "HAC, гл. 6",
  "title": "Menezes A., van Oorschot P., Vanstone S. Handbook of Applied Cryptography. CRC Press, 1996. Гл. 6 «Stream Ciphers»",
  "url": "https://cacr.uwaterloo.ca/hac/about/chap6.pdf",
  "section": "§6.1.1 (i): шифр Вернама — каждый знак складывается со своим знаком гаммы; если гамма действительно случайна, это одноразовый блокнот: шифровка не даёт о тексте никакой информации (безусловная стойкость). Шифры с гаммой из короткого ключа безусловной стойкости не дают — расчёт на вычислительную стойкость",
  "primary": true,
  "verified": true,
  "checked": "09.11.2026"
 },
 "krack_2017": {
  "label": "Vanhoef, Piessens 2017",
  "title": "Vanhoef M., Piessens F. Key Reinstallation Attacks: Forcing Nonce Reuse in WPA2 // CCS '17: Proceedings of the 2017 ACM SIGSAC Conference on Computer and Communications Security (Dallas, TX, USA). New York : ACM, 2017. P. 1313–1328. DOI 10.1145/3133956.3134027",
  "url": "https://doi.org/10.1145/3133956.3134027",
  "section": "Аннотация и введение: устройство можно заставить заново установить уже используемый ключ; при этом номер пакета (одноразовое число) сбрасывается, и одноразовые числа повторяются",
  "primary": true,
  "verified": true,
  "checked": "10.11.2026"
 },
 "krack_site": {
  "label": "krackattacks.com",
  "title": "Vanhoef M. KRACK Attacks: Breaking WPA2 : [сайт авторов исследования] (дата обращения: 10.11.2026)",
  "url": "https://www.krackattacks.com/",
  "section": "Введение: слабость — в самом стандарте Wi-Fi, а не в отдельных устройствах; атаки не раскрывают пароль сети; вопросы и ответы: смена пароля атаку не предотвращает и не смягчает; пользователям — установить обновления",
  "primary": true,
  "verified": true,
  "checked": "10.11.2026"
 },
 "kz_cert": {
  "label": "KZ-CERT",
  "title": "KZ-CERT — национальная служба реагирования на компьютерные инциденты (АО «Государственная техническая служба»)",
  "url": "https://kz-cert.kz/",
  "section": "Главная страница: «Сообщить об инциденте», бесплатная горячая линия 1400, incident@cert.gov.kz",
  "primary": true,
  "verified": true,
  "checked": "09.11.2026"
 },
 "kz_pd_94v": {
  "label": "Закон РК № 94-V, ст. 12 п. 2",
  "title": "Закон РК от 21.05.2013 № 94-V «О персональных данных и их защите», ст. 12 п. 2",
  "url": "https://adilet.zan.kz/rus/docs/Z1300000094",
  "section": "Хранение персональных данных — в базе и (или) цифровом объекте на территории Республики Казахстан",
  "primary": true,
  "verified": true,
  "checked": "09.11.2026"
 },
 "kz_pd_94v_12_1": {
  "label": "Закон РК № 94-V, ст. 12 п. 1",
  "title": "Закон РК от 21.05.2013 № 94-V «О персональных данных и их защите», ст. 12 п. 1",
  "url": "https://adilet.zan.kz/rus/docs/Z1300000094",
  "section": "Накопление персональных данных — сбор данных, необходимых и достаточных для задач собственника или оператора",
  "primary": true,
  "verified": true,
  "checked": "09.11.2026"
 },
 "kz_pd_94v_def": {
  "label": "Закон РК № 94-V, ст. 1",
  "title": "Закон РК от 21.05.2013 № 94-V «О персональных данных и их защите», ст. 1 пп. 2, 14-1, 16 (редакция на 09.11.2026)",
  "url": "https://adilet.zan.kz/rus/docs/Z1300000094",
  "section": "Персональные данные — сведения о субъекте (физическом лице), дополненные идентификаторами — информацией, позволяющей его идентифицировать",
  "primary": true,
  "verified": true,
  "checked": "09.11.2026"
 },
 "kz_uk_205": {
  "label": "УК РК, ст. 205",
  "title": "Уголовный кодекс РК от 03.07.2014 № 226-V, ст. 205 «Неправомерный доступ к информации»",
  "url": "https://adilet.zan.kz/rus/docs/K1400000226",
  "section": "Ч. 1: умышленный неправомерный доступ к охраняемой законом информации на электронном носителе или к объекту информатизации, повлёкший существенный вред; наказание — от штрафа до 160 МРП до ареста на срок до 40 суток. Ч. 2: то же в отношении критически важных объектов информационно-коммуникационной инфраструктуры — до ареста на срок до 50 суток. Ч. 3: деяния ч. 1 или 2, повлёкшие по неосторожности тяжкие последствия, — штраф до 2000 МРП, исправительные работы в том же размере, общественные работы до 600 часов, ограничение свободы или лишение свободы на срок до двух лет (редакция с изменениями от 16.07.2025)",
  "primary": true,
  "verified": true,
  "checked": "10.11.2026"
 },
 "kz_uk_punish": {
  "label": "УК РК, ст. 40, 45, 46",
  "title": "Уголовный кодекс РК от 03.07.2014 № 226-V, ст. 40 «Виды наказаний», ст. 45 «Арест», ст. 46 «Лишение свободы»",
  "url": "https://adilet.zan.kz/rus/docs/K1400000226",
  "section": "Ст. 40: за уголовный проступок — штраф, исправительные работы, общественные работы, арест, выдворение; за преступление — штраф, исправительные работы, общественные работы, ограничение свободы, лишение свободы. Ст. 45: арест — изоляция осуждённого от общества на срок от 10 до 50 суток. Ст. 46: лишение свободы — изоляция осуждённого от общества путём направления в учреждение уголовно-исполнительной системы",
  "primary": true,
  "verified": true,
  "checked": "10.11.2026"
 },
 "kz_uk_10": {
  "label": "УК РК, ст. 10",
  "title": "Уголовный кодекс РК от 03.07.2014 № 226-V, ст. 10 «Понятия преступления и уголовного проступка»",
  "url": "https://adilet.zan.kz/rus/docs/K1400000226",
  "section": "П. 1: уголовные правонарушения делятся на преступления и уголовные проступки. П. 2: преступление — деяние под угрозой наказания, в том числе ограничения или лишения свободы. П. 3: уголовный проступок — виновное деяние, не представляющее большой общественной опасности, причинившее незначительный вред либо создавшее угрозу причинения вреда, за которое предусмотрены штраф, исправительные работы, общественные работы, арест или выдворение. Категорию деяния на деле задаёт вид наказания в статье (ст. 205 ч. 1 — существенный вред, но наказание — до ареста)",
  "primary": true,
  "verified": true,
  "checked": "10.11.2026"
 },
 "kerckhoffs_1883": {
  "label": "Kerckhoffs 1883",
  "title": "Kerckhoffs A. La cryptographie militaire // Journal des sciences militaires. 1883. Vol. IX. P. 5–38 (janvier), 161–191 (février)",
  "url": "https://www.petitcolas.net/kerckhoffs/",
  "section": "Шесть требований к военному шифру; второе: система не должна требовать секретности, её захват противником не должен причинять вреда (по изданию статьи и английскому пересказу на странице)",
  "primary": true,
  "verified": true,
  "checked": "14.11.2026"
 },
 "saltzer_1975": {
  "label": "Saltzer, Schroeder 1975",
  "title": "Saltzer J. H., Schroeder M. D. The Protection of Information in Computer Systems // Proceedings of the IEEE. 1975. Vol. 63, no. 9",
  "url": "https://web.mit.edu/Saltzer/www/publications/protection/Basic.html",
  "section": "Принцип Open design: защита держится не на незнании устройства, а на ключах и паролях",
  "primary": true,
  "verified": true,
  "checked": "09.11.2026"
 },
 "wfa_update_2017": {
  "label": "Wi-Fi Alliance 16.10.2017",
  "title": "Wi-Fi Alliance. Wi-Fi Alliance security update, 16.10.2017",
  "url": "https://www.wi-fi.org/news-events/newsroom/wi-fi-alliance-security-update",
  "section": "Ошибка исправляется обычным обновлением программ; Wi-Fi Alliance требует проверять её в лабораториях сертификации",
  "primary": true,
  "verified": true,
  "checked": "09.11.2026"
 },
 "lecture_10_11_otp": {
  "label": "Лекция 10–11, контрольные вопросы",
  "title": "Лекция 10–11 «Системы с открытым ключом», контрольные вопросы",
  "file": "Лекция_10_11_Системы_с_открытым_ключом_Теоретические_основы_системы.docx",
  "section": "«Может ли быть взломан правильно реализованный „одноразовый блокнот“?»",
  "primary": false,
  "verified": true,
  "checked": "09.11.2026",
  "kind": "lecture"
 },
 "lecture_14_15_range": {
  "label": "Лекция 14–15, «Реализация безопасности», размещение точек доступа",
  "title": "Лекция 14–15 «Безопасность беспроводных соединений», раздел «Реализация безопасности беспроводных сетей», размещение точек доступа",
  "file": "Лекция_14_15_Безопасность_беспроводных_соединений.docx",
  "section": "«Беспроводные сигналы могут распространяться на значительные расстояния… до других этажей здания, автомобильной парковки или вовсе за пределы территории предприятия»",
  "primary": false,
  "verified": true,
  "checked": "09.11.2026",
  "kind": "lecture"
 },
 "lecture_14_15_detect": {
  "label": "Лекция 14–15, «Обнаружение WLAN»",
  "title": "Лекция 14–15 «Безопасность беспроводных соединений», раздел «Обнаружение WLAN»",
  "file": "Лекция_14_15_Безопасность_беспроводных_соединений.docx",
  "section": "«Внешняя антенна не является необходимой, однако помогает расширить диапазон обнаружения»",
  "primary": false,
  "verified": true,
  "checked": "15.11.2026",
  "kind": "lecture"
 },
 "project_rules": {
  "label": "README проекта, «Рамки»",
  "title": "«Ключ и замок»: README.md, раздел «Рамки»",
  "file": "README.md",
  "section": "Программа не сканирует эфир, не подключается к сетям Wi-Fi, не работает с трафиком и не подбирает пароли",
  "primary": true,
  "verified": true,
  "checked": "09.11.2026",
  "kind": "project"
 }
});
