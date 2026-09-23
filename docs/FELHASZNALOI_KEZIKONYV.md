# Fuvarterv – Felhasználói kézikönyv

Ez a kézikönyv lépésről lépésre bemutatja a Fuvartervet. Ha elakadsz, keresd meg a témát a tartalomjegyzékben,
vagy nézd meg a [Gyakori kérdések](#16-gyakori-kérdések-és-hibaelhárítás) részt a végén.

---

## Tartalom

1. [Mi a Fuvarterv?](#1-mi-a-fuvarterv)
2. [Ki mit lát? – Admin és Sofőr](#2-ki-mit-lát--admin-és-sofőr)
3. [Belépés és a képernyő felépítése](#3-belépés-és-a-képernyő-felépítése)
4. [Így érdemes haladni – rövid útmutató](#4-így-érdemes-haladni--rövid-útmutató)
5. [Alapadatok felvétele (Adatok fül)](#5-alapadatok-felvétele-adatok-fül)
6. [Csapatok és edzések](#6-csapatok-és-edzések)
7. [A heti beosztás elkészítése (Beosztás fül)](#7-a-heti-beosztás-elkészítése-beosztás-fül)
8. [Kézi módosítások és zárolás](#8-kézi-módosítások-és-zárolás)
9. [A hét áttekintése (Hét fül)](#9-a-hét-áttekintése-hét-fül)
10. [Egy fuvar szerkesztése (Fuvar szerkesztő)](#10-egy-fuvar-szerkesztése-fuvar-szerkesztő)
11. [A sofőr napi nézete (Sofőr fül)](#11-a-sofőr-napi-nézete-sofőr-fül)
12. [Heti menetrend nyomtatása](#12-heti-menetrend-nyomtatása)
13. [Felhasználók kezelése](#13-felhasználók-kezelése)
14. [Mentés és korábbi mentések](#14-mentés-és-korábbi-mentések)
15. [Mintaadatok visszaállítása](#15-mintaadatok-visszaállítása)
16. [Gyakori kérdések és hibaelhárítás](#16-gyakori-kérdések-és-hibaelhárítás)
17. [Fogalomtár](#17-fogalomtár)

---

## 1. Mi a Fuvarterv?

A Fuvarterv a klub edzésszállításait szervezi. Segítségével:

- nyilvántartod a **csapatokat**, az **edzéseket**, a **megállókat**, a **járműveket** és a **sofőröket**;
- a program **kiszámolja a heti beosztást**: melyik sofőr, melyik busszal, mikor és milyen útvonalon viszi a sportolókat az edzésre és haza;
- a beosztás úgy készül, hogy **a lehető legkevesebbe kerüljön**, és **a munka arányosan oszoljon el** a sofőrök között;
- a sofőrök a telefonjukon látják a **saját napi útvonalukat**, nagy betűkkel;
- **kinyomtathatod** egy sofőr heti menetrendjét táblázatban.

A program **magától ment** minden változtatást. Nincs külön „Mentés” gomb a teljes
munkához (az egyes űrlapokon persze van).

---

## 2. Ki mit lát? – Admin és Sofőr

Kétféle felhasználó van:

| Szerepkör | Mit lát? | Mit csinálhat? |
|---|---|---|
| **Admin** | Mind a négy fület: **Hét**, **Beosztás**, **Adatok**, **Sofőr** | Mindent felvehet, módosíthat, törölhet. |
| **Sofőr** | Csak a **Sofőr** fület | Csak nézelődhet, semmit nem tud módosítani. |

> **Jó tudni:** aki belép, de nincs felvéve a Felhasználók listájára, az automatikusan
> **sofőrnek** számít. Adminná csak egy másik admin teheti meg (lásd
> [13. Felhasználók kezelése](#13-felhasználók-kezelése)).

---

## 3. Belépés és a képernyő felépítése

### Belépés

1. Nyisd meg a Fuvarterv címét a böngészőben (telefonon vagy számítógépen).
2. Írd be az **E-mail** címedet és a **Jelszavadat**.
3. Kattints a **Bejelentkezés** gombra.

Ha nincs még fiókod, vagy elfelejtetted a jelszavad, fordulj a klub rendszergazdájához.

### A képernyő részei

**Felül, a sötét sávban** (fejléc), jobb oldalt három gomb van:

| Ikon | Neve | Mire jó? |
|---|---|---|
| ↺ (körbeforduló nyíl) | **Korábbi mentések** | Visszaállíthatsz egy korábbi állapotot. Csak adminnak látszik. |
| ⇥ (kilépés nyíl) | **Kijelentkezés** | Kilépsz a programból. |
| ? (kérdőjel) | **Súgó** | Rövid összefoglaló a program működéséről. |

**Alul** találod a **füleket** (fő menü): **Hét**, **Beosztás**, **Adatok**, **Sofőr**.
A kiválasztott fül világít.

**Kis kérdőjelek (?)**: sok gomb és mező mellett van egy kis kérdőjel. Kattints rá, és
megjelenik egy rövid magyarázat. Máshova kattintva eltűnik.

> **Tipp:** a program színei a telefonod beállításához igazodnak. Ha a telefonod sötét
> módban van, a Fuvarterv is sötét lesz.

---

## 4. Így érdemes haladni – rövid útmutató

Ha most kezded, ebben a sorrendben dolgozz. A részletek a hivatkozott fejezetekben vannak.

1. **Állomások** felvétele – ahol a sportolók fel- és leszállnak. ([5.1](#51-állomások))
2. **Helyszínek** felvétele – ahol az edzések vannak. ([5.2](#52-helyszínek))
3. **Telephely** felvétele – ahol a buszok éjszakáznak. ([5.3](#53-telephelyek))
4. **Járművek** felvétele. ([5.4](#54-járművek))
5. **Sofőrök** felvétele. ([5.5](#55-sofőrök))
6. **Csapatok** létrehozása: megállók, létszámok, helyszínek. ([6](#6-csapatok-és-edzések))
7. **Edzések** felvétele a csapatokhoz. ([6.6](#66-edzések-felvétele))
8. A **Beosztás** fülön: **Mátrix**, majd **Heti beosztás optimalizálása**, végül
   **Alkalmazás és fuvarok rögzítése**. ([7](#7-a-heti-beosztás-elkészítése-beosztás-fül))
9. Ha kell, **kézi módosítás** és **zárolás**. ([8](#8-kézi-módosítások-és-zárolás))
10. A sofőrök a **Sofőr** fülön látják a napjukat; ha papír kell, **nyomtass**. ([11](#11-a-sofőr-napi-nézete-sofőr-fül), [12](#12-heti-menetrend-nyomtatása))

---

## 5. Alapadatok felvétele (Adatok fül)

Az **Adatok** fül tetején kategóriák közül választhatsz:
**Csapatok · Állomások · Helyszínek · Telephelyek · Járművek · Sofőrök · Felhasználók**.

Minden kategória ugyanúgy működik:

- A lista tetején látod, hány elem van, és egy **Új …** gombot (pl. **Új állomás**).
- Minden sor mellett van egy **ceruza** (szerkesztés) és egy **kuka** (törlés) gomb.
- Az űrlap alján **Mentés** és **Mégse** gomb van. A csillaggal (\*) jelölt mezők kötelezők.

### 5.1 Állomások

Az **állomás** egy fel- vagy leszállóhely, például egy falu főtere vagy egy iskola.

1. **Adatok → Állomások → Új állomás**.
2. Add meg a **Nevet** (pl. „Zákányszék, Fő tér”).
3. Ha tudod, írd be a **Címet** (ez csak tájékoztató).
4. **Koordináta \*** – kattints a **Kijelölés térképen** gombra, és jelöld meg a pontot
   (lásd [5.6](#56-hely-kijelölése-a-térképen)).
5. **Mentés**.

> **Fontos:** koordináta nélkül nem lehet menteni. Ebből számolja a program, mennyi ideig
> tart az út két pont között.

A listában a név mellett:
- **zöld gombostű** = a koordináta megvan;
- **sárga figyelmeztető jel** = hiányzik a koordináta (régebbi adatnál fordulhat elő) –
  nyisd meg és jelöld ki a helyet.

### 5.2 Helyszínek

A **helyszín** az a hely, ahol az edzés van (pl. sportcsarnok).

A felvétele ugyanúgy megy, mint az állomásé (név, cím, koordináta). Egy plusz beállítás van:

- **Csak országos matricás autóval érhető el** – kapcsold be, ha a helyszínre csak
  autópályán lehet eljutni. Ilyenkor a program ide **csak autópálya-matricás** járművet oszt
  be, és szól, ha nincs ilyen szabad.

### 5.3 Telephelyek

A **telephely** az a hely, ahonnan a busz reggel **elindul**, és ahova este **visszatér**.
Ez azért fontos, mert **a sofőr fizetett ideje a telephelytől a telephelyig tart**.

1. **Adatok → Telephelyek → Új telephely**: név, cím, koordináta, **Mentés**.
2. Ezután állítsd be a **klub telephelyét**: **Beosztás fül → ⚙ (Paraméterek) → Klub telephelye**.

Ha egy busz nem a klub telephelyén áll (például a sofőr otthon tartja), azt a járműnél
külön megadhatod (lásd [5.4](#54-járművek)).

> **Figyelem:** telephely nélkül a program úgy számol, mintha a sofőr két fuvar között
> mindig hazamehetne. Távoli helyszínnél ez nem igaz, ezért a költség és a fizetett idő
> pontatlan lesz. A Beosztás fül ilyenkor figyelmeztet.

### 5.4 Járművek

1. **Adatok → Járművek → Új jármű**.
2. **Név** (pl. „Fehér Ford”).
3. **Rendszám \*** – bármilyen formában beírhatod, a program átalakítja (pl. `abc123` → `ABC-123`).
   Két járműnek nem lehet ugyanaz a rendszáma.
4. **Férőhelyek száma (sofőr nélkül) \*** – hány utas fér el. A sofőrt ne számold bele!
5. **Van országos autópálya-matricája** – kapcsold be, ha van.
6. **Telephely** – hagyd a „— a klub telephelye —” értéken, vagy válaszd ki, ahol a busz áll.
7. **Megjegyzés** (nem kötelező), majd **Mentés**.

### 5.5 Sofőrök

1. **Adatok → Sofőrök → Új sofőr**.
2. Töltsd ki a mezőket:

| Mező | Mit írj bele? |
|---|---|
| **Név \*** | A sofőr neve. |
| **Telefonszám** | A listában erre kattintva fel is hívhatod. |
| **E-mail (belépéshez)** | Ha a sofőr ezzel a címmel lép be, a Sofőr fülön rögtön a **saját** napja nyílik meg. |
| **Preferált jármű** | Ha a sofőr általában ugyanazt a buszt vezeti. A program ezt előnyben részesíti, de nem kötelező érvényű. |
| **Órabér (Ft/óra)** | A sofőr órabére. Alapértelmezés: 3000 Ft. |
| **Min. műszak (perc)** | A legrövidebb idő, amit a klub egy kiállásért kifizet. Alapértelmezés: 180 perc (3 óra). |
| **Elérhetőség** | Mikor osztható be a sofőr (lásd lent). |
| **Megjegyzés** | Bármi, ami fontos. |

**Elérhetőség megadása:**

1. Kattints az **Idősáv hozzáadása** gombra.
2. Jelöld be a napokat (**H, K, Sze, Cs, P, Szo, V**).
3. Add meg, mettől meddig ér rá (pl. 15:00–21:00).
4. Több idősávot is felvehetsz. Az **X** gombbal törölhetsz egy idősávot.

> **Jó tudni:** ha **nincs** idősáv megadva, a sofőr **bármikor** beosztható.

> **Mire jó a „Min. műszak”?** Ha egy sofőr két fuvara között sok idő van, a program eldönti,
> megéri-e hazaküldeni, vagy olcsóbb, ha a helyszínen vár. Minél nagyobb a minimális műszak,
> annál inkább egyben marad a sofőr napja.

### 5.6 Hely kijelölése a térképen

Az állomás, a helyszín és a telephely űrlapján a **Kijelölés térképen** (vagy **Módosítás
térképen**) gombbal nyílik meg a térkép.

1. **Keresés:** írj be egy címet a felső mezőbe (pl. „Szeged, Kossuth utca 1.”), és kattints
   a nagyító gombra. Válaszd ki a találatot – a térkép odaugrik.
   *A keresés csak odaviszi a térképet, még nem jelöli ki a pontot!*
2. **Kijelölés:** kattints (vagy nyomj hosszan) a pontos helyre a térképen. Megjelenik a jelölő.
3. **Pontosítás:** a jelölőt ujjal (vagy egérrel) arrébb húzhatod. Új kattintás felülírja az előzőt.
4. Alul a **Kijelölt pont** alatt látod a koordinátát.
5. Kattints a **Mentés** gombra.

**Koordináta beillesztése:** ha például a Google Térképről kimásoltad a koordinátát, alul a
„Koordináta beillesztése” mezőbe beírhatod ilyen formában: `46.25311, 20.14503`, majd
**Beszúr**.

> Ha a térkép nem töltődik be (például gyenge a net), egyszerűsített térkép jelenik meg. A már
> felvett pontjaid ott is látszanak, és a koordináta-beillesztés is működik.

### 5.7 Törlés

A törlés **két lépésben** történik, hogy véletlenül ne törölj semmit:

1. Kattints a **kuka** gombra – a gomb pirosra vált.
2. **3 másodpercen belül** kattints rá még egyszer. Ha nem teszed, a gomb visszaáll.

Amit **használ** valami, azt nem lehet törölni. Ilyenkor ezt látod:
„**Nem törölhető. Használatban: …**” – például egy állomást, amely szerepel egy csapat
megállói között, vagy egy járművet, amelyhez fuvar tartozik. Előbb szüntesd meg a
használatot, utána törölhetsz.

> **Figyelem:** egy **csapat** törlésekor az edzései és a hozzájuk tartozó fuvarok is törlődnek.

---

## 6. Csapatok és edzések

### 6.1 Új csapat

1. **Adatok → Csapatok → Új csapat**.
2. **Név \*** (pl. „U12 Lány”), **Korosztály** (pl. U12), **Nem** (lány, fiú, női, férfi, vegyes).
3. **Szállítandó létszám** – hány embert kell vinni. Ez csak **tartalék érték**: akkor
   számít, ha megállónként nem adsz meg létszámot.
4. **Szín** – ezzel a színnel jelenik meg a csapat a Hét fülön.
5. **Mentés**.

A csapatra kattintva megnyílik az **adatlapja**. A jobb felső **ceruzával** a fenti adatokat
módosíthatod. Az adatlap alján van a **Csapat törlése** gomb.

### 6.2 Állomások és létszám megállónként

Az adatlapon, az **Állomások (felszállóhelyek)** részben:

1. **Kattints** azokra az állomásokra, ahol a csapat tagjai felszállnak. A bekapcsolt
   állomás kiemelve, színes háttérrel jelenik meg.
2. Megjelenik a **Létszám megállónként** doboz. Írd be, hány ember száll fel az egyes megállókon.
   Jobb felül a **Σ** jel mellett látod az összesítést.

> **Nagyon fontos különbség – 0 vagy üres?**
>
> - Ha **0**-t írsz be: a busz **kihagyja** ezt a megállót (megjelenik a „kihagyva” felirat).
> - Ha **üresen** hagyod: az azt jelenti, hogy „még nem tudom”. A busz **ide is elmegy**.

Ha minden létszámmező üres, a program a csapatnál megadott **Szállítandó létszámot** használja.

### 6.3 Útvonal (felszállási sorrend)

Ha legalább két állomás be van kapcsolva, megjelenik az **Útvonal** doboz:

- **Automatikus** – a program kiszámolja a leggyorsabb sorrendet. Alatta látod a
  **Számított sorrendet** és azt, hogy hány perc az út az első megállótól.
  - **Kezdő megálló:** ha azt szeretnéd, hogy a busz mindig egy adott megállónál kezdjen,
    válaszd ki itt. Ha üresen hagyod, a leggyorsabb sorrend nyer.
- **Kézi sorrend** – a megállók abban a sorrendben követik egymást, ahogyan **bekapcsoltad**
  őket. Hazafelé fordított sorrendben.

### 6.4 Visszaút (leszállóhelyek)

Alapesetben a busz hazafelé ugyanazokat a megállókat érinti, fordított sorrendben
(**Megegyezik az odaúttal**).

Ha a sportolók máshol szállnak le, mint ahol felszálltak:

1. Válaszd a **Külön lista** lehetőséget.
2. Kapcsold be a leszállóhelyeket, és add meg a létszámokat.
3. Automatikus útvonalnál megadhatod az **Utolsó megállót (vissza)** is.

A visszaút teljesen független az odaúttól: lehet kevesebb, több vagy egészen más megálló.

### 6.5 Helyszínek hozzárendelése

Az adatlap **Helyszínek** részében kattints azokra a helyszínekre, ahol a csapat edz.
**Edzést csak olyan helyszínre vehetsz fel, amely itt be van kapcsolva.**

### 6.6 Edzések felvétele

1. A csapat adatlapján, az **Edzések** résznél kattints az **Új edzés** gombra.
2. **Helyszín \*** – válaszd ki.
3. **Ismétlődés:**
   - **Heti** – minden héten ismétlődik. Jelöld be a **Napokat** (pl. K és Cs).
   - **Egyszeri** – csak egy adott napon van (pl. torna). Add meg a **Dátumot**.
4. **Kezdés \*** és **Vége \*** időpont.
5. **Mentés**.

Az edzés sorára kattintva megnyílik az edzés részletes lapja. A kuka gombbal törölheted az edzést
(a hozzá tartozó fuvarokkal együtt).

### 6.7 Edzés saját megállólistával

Előfordul, hogy egy edzés **más helyszínen** van, vagy **más megállókról** kell hozni a sportolókat.

1. Nyisd meg az edzést.
2. A **Megállók** résznél válaszd a **Saját lista** lehetőséget.
3. A program átmásolja a csapat jelenlegi listáját – ezt most már szabadon módosíthatod
   (ugyanúgy, mint a [6.2–6.4](#62-állomások-és-létszám-megállónként) részben).
4. **Szállítandó létszám ezen az edzésen** – tartalék érték erre az edzésre.

> **Jó tudni:**
> - A saját lista **független**: ha később a csapat listáját módosítod, ez nem változik.
> - Ha a csapatnak már van másik saját listás edzése, a **Másolás másik edzésből** mezővel
>   átveheted annak megállóit és létszámait.
> - A **Megegyezik a csapatéval** gombbal visszaállhatsz a csapat listájára.

### 6.8 Ha nem fér be mindenki egy buszba

Ha a létszám több, mint a legnagyobb jármű férőhelye, a program **megállónként több buszra
osztja** a csapatot. Ehhez **meg kell adni a megállónkénti létszámokat** – enélkül nem tudja,
kit melyik buszra tegyen, és ezt a Beosztás fül figyelmeztetésként jelzi.

---

## 7. A heti beosztás elkészítése (Beosztás fül)

### 7.1 A képernyő felépítése

Fentről lefelé:

1. **Beosztás** cím, mellette **⚙** gomb – a **Paraméterek** (lásd [7.2](#72-paraméterek-)).
2. **Napválasztó** – Hétfő … Vasárnap. Ezzel választod ki, **melyik nap** láncait nézed.
3. **Mutatók** a kiválasztott napra:

   | Mutató | Jelentése |
   |---|---|
   | **sofőr** | Hány sofőr dolgozik aznap. |
   | **fizetett idő** | Összesen hány órát fizet a klub (a minimális műszakkal együtt). |
   | **üresjárat** | Hány percet megy a busz utas nélkül. |
   | **várakozás** | Hány percet várnak a sofőrök a helyszínen. |
   | **becsült ktg.** | A nap becsült költsége forintban. |

4. **Figyelmeztetések** – ha van, egy sárga sáv mutatja a számukat (pl. „2 figyelmeztetés”).
   Kattints rá a részletekért. Például: nincs telephely, vagy egy csapathoz nem készült
   feladat, mert hiányzik a létszám.
5. **Gombok:** **Heti beosztás optimalizálása**, **Mátrix**, **Heti menetrend nyomtatása**.
6. A **Mátrix** állapota (lásd [7.3](#73-mátrix--pontos-utazási-idők)).
7. A nap **láncai** (lásd [7.5](#75-a-láncok-olvasása)).
8. **Fedetlen feladatok** – ha van olyan fuvar, amit nem sikerült senkihez beosztani.

### 7.2 Paraméterek (⚙)

Ezek a beállítások az egész beosztásra érvényesek. Ha nem vagy biztos benne, hagyd az
alapértéken.

| Beállítás | Mit jelent? | Alapérték |
|---|---|---|
| **Érkezés edzés előtt (perc)** | Ennyivel az edzés kezdete előtt érjen oda a busz. | 10 perc |
| **Indulás edzés után (perc)** | Ennyivel az edzés vége után induljon haza a busz. | 10 perc |
| **Kiszállási díj (Ft)** | Egyszeri díj minden kiállásért (műszakonként). Ez ösztönzi a programot, hogy egy sofőrnek több feladatot adjon egymás után (lásd a táblázat alatti dobozt). | 1500 Ft |
| **Megállónkénti idő (perc)** | Ennyi ideig áll a busz egy megállóban. | 2 perc |
| **Becsült sebesség (km/h)** | Ezzel becsül a program, ha nincs pontos útvonaladat. | 50 km/h |
| **Alap üresjárat adat híján (perc)** | Csak akkor számol vele a program, ha egy pontnak **egyáltalán nincs koordinátája**. Mivel koordináta nélkül nem lehet pontot menteni, ez a gyakorlatban szinte soha nem fordul elő – ha mégis, ne ezt az értéket állítsd, hanem pótold a koordinátát (sárga figyelmeztető jel, lásd [5.1](#51-állomások)). | 12 perc |
| **Üresjárat költsége (Ft/perc)** | Mennyibe kerül egy perc utas nélküli út (üzemanyag, kopás). Ez tartja vissza a programot attól, hogy feleslegesen hazaküldje a buszt. | 100 Ft/perc |
| **Preferált jármű súlya (Ft)** | Mennyire ragaszkodjon a sofőr saját buszához. 0 = nem számít. | 1000 |
| **Egyenletes terhelés súlya (Ft)** | Mennyire ossza el egyenletesen a munkát a sofőrök között. 0 = csak a költség számít. | 5000 |
| **Klub telephelye** | Innen indulnak a buszok, ha a járműnél nincs más megadva. | nincs megadva |

> **Mennyi legyen a kiszállási díj?**
>
> Ez a szám dönti el, **mennyi várakozás éri meg egy újabb kiállás helyett**. A program akkor
> ad két feladatot ugyanannak a sofőrnek, ha a köztük lévő várakozás bére kevesebb, mint egy
> újabb kiszállási díj.
>
> A fordulópont: **kiszállási díj ÷ percenkénti bér**. Az alapértékekkel (1500 Ft díj,
> 3000 Ft/óra = 50 Ft/perc) ez **30 perc** — vagyis a program inkább megvárat egy sofőrt fél
> órát, mint hogy másikat küldjön ki.
>
> - **Nagyobb érték** → több láncolás: kevesebb sofőr, de többet várnak.
> - **Kisebb érték** → kevesebb várakozás, de több kiállás.
> - **0** → a program egyáltalán nem láncol, minden feladat külön kiállás lesz.

### 7.3 Mátrix – pontos utazási idők

A **Mátrix** gomb egyszer lekéri az interneten a **valós közúti menetidőket** minden megálló,
helyszín és telephely között, és eltárolja őket. Így a beosztás sokkal pontosabb lesz.

- Mikor nyomd meg? **Az első beosztás előtt**, és **valahányszor új állomást, helyszínt vagy
  telephelyet veszel fel**, vagy áthelyezel egy pontot.
- A gomb alatti szöveg mutatja, mikor készült a mátrix. Ha azóta változtak a pontok, piros
  felirat jelzi: **„újraszámítás ajánlott!”**
- Ha az útvonaltervező épp nem elérhető, a program légvonalas becslést használ, és ezt ki is írja.

### 7.4 Heti beosztás optimalizálása

Ez a program legfontosabb funkciója. Egy gombnyomással elkészíti **az egész hét** beosztását.

1. Kattints a **Heti beosztás optimalizálása** gombra.
2. Megjelenik a **„Optimalizálás folyamatban…”** ablak. **Várj türelmesen** – ez több másodpercig
   is eltarthat. Ne zárd be az oldalt. A javaslat magától megjelenik.
3. Megnyílik a **Heti optimalizálás — előtte / utána** ablak. Nézd át:

   - **Összehasonlító táblázat** (*Jelenlegi* és *Javasolt*): láncok száma, fizetett idő,
     becsült költség, fedetlen feladatok, egyenlőtlenség (0 = teljesen egyenletes elosztás).
   - **Munka eloszlása:** sofőrönként mennyi munka volt eddig, mennyi lesz, és mennyi lenne
     az arányos rész.
   - **Napok:** naponként hány lánc és sofőr, mennyibe kerül.
   - **Figyelmeztetések:** például ha egy feladatot **nem lehet lefedni** (és miért), vagy
     hogy **hány kézzel felvett fuvar cserélődik le**.

4. Ha rendben van, kattints az **Alkalmazás és fuvarok rögzítése** gombra.
   Ha nem, a **Mégse** gombbal semmi nem változik.

**Mi történik az alkalmazáskor?**

- A hét minden napjának beosztása lecserélődik a javaslatra.
- A fuvarok **azonnal megjelennek** a **Hét** és a **Sofőr** fülön.
- A **zárolt** feladatok és láncok **nem változnak** (lásd [8.2](#82-zárolás--amit-a-program-nem-írhat-felül)).
- A **kézzel felvett, nem zárolt** fuvarokat a program lecserélheti. Kivétel: ha egy feladatot
  a program nem tud lefedni, a hozzá kézzel felvett fuvar megmarad.

> **Tipp:** ha a javaslat alján azt látod, hogy „A kiegyenlítés nem állt be teljesen”,
> futtasd le még egyszer az optimalizálást – általában tovább javul.

### 7.5 A láncok olvasása

Egy **lánc** egy sofőr egy járművel egymás után elvégzett fuvarjai. A Beosztás fülön a
kiválasztott nap láncait kártyák mutatják.

**A kártya fejléce (sötét sáv):**
- a sofőr neve, a jármű rendszáma, esetleg a **matricás** jelzés és a férőhelyek száma;
- a lánc kezdő és záró időpontja;
- jobb szélen a **lakat** gomb (lánc zárolása, lásd [8.2](#82-zárolás--amit-a-program-nem-írhat-felül)).

**A fejléc alatti sor:**
- **fizetett:** hány órát fizet a klub (ha a minimális műszak miatt több, azt jelzi: „min. műszak”);
- **műszak:** mettől meddig tart a telephelytől számítva;
- **ktg.:** becsült költség;
- **max. létszám:** a legtöbb utas egyszerre.

Ha egy sofőrnek aznap több lánca van, de nincs ideje közben hazamenni, az **egy műszak**. Ilyenkor
a pénz csak a műszak **első** láncánál szerepel, a többinél ez áll: „ugyanaz a műszak …”.

**A kártya törzse, fentről lefelé:**
- **kiállás** – mikor indul a busz a telephelyről;
- a **feladatok**: ODA vagy VISSZA, csapat, időpont, honnan hova, hány fő, és a megállók időkkel;
- a feladatok között: **üresjárat** (utas nélküli út) és **várakozás** percben;
- **beállás** – mikor ér vissza a busz a telephelyre.

**Piros jelzések** a kártyán – ezeket érdemes kijavítani:
- **Szoros átkötés:** nincs elég idő eljutni az egyik feladattól a következőig.
- **Sofőrütközés / Járműütközés:** ugyanaz a sofőr vagy jármű egyszerre két helyen lenne.
- A sofőr **nem érhető el** ebben az idősávban.
- A létszám **több**, mint a jármű férőhelye.
- A jármű **nem matricás**, de a lánc matricás helyszínre megy.

---

## 8. Kézi módosítások és zárolás

### 8.1 Feladat áthelyezése

Ha nem tetszik, hogy egy feladatot ki visz:

1. A feladat sorában kattints a **két irányú nyíl** gombra (**Áthelyezés**).
2. Válassz:
   - **Meglévő láncba** – egy másik sofőr már meglévő láncához teszed;
   - **Fedetlenek közé** – kiveszed a láncból;
   - **Új lánc indítása** – kiválasztod a **Sofőrt** és a **Járművet**, majd **Új lánc ezzel a feladattal**.

> **Jó tudni:**
> - A kézzel áthelyezett feladat **automatikusan zárolódik**, így a következő optimalizálás
>   nem írja felül.
> - A fuvarok **azonnal frissülnek**, a sofőr rögtön látja a változást.
> - Ha az áthelyezés ütközést okoz, a program pirossal jelzi, de engedi.

### 8.2 Zárolás – amit a program nem írhat felül

A **zárolás** azt jelenti: „ezt már megbeszéltem, ne változtasd meg”. A zárolt dolgokhoz az
optimalizálás **nem nyúl**.

**Egy feladat zárolása:** a lánc kártyáján, a feladat sorában kattints a **lakat** gombra.
Zárva sötét, nyitva világos.

**Egy egész lánc zárolása:** a kártya fejlécében kattints a **lakat** gombra. Ilyenkor:
- a lánc feladatai, a sofőr és a jármű **együtt maradnak**;
- a program **hozzáfűzhet** még új feladatot a lánchoz, de ami így kerül bele, az nem lesz zárolva;
- a láncon belüli feladatok lakatja ilyenkor zárva látszik, és nem kapcsolható – a feloldás a
  lánc fejlécében van.

**Kézzel felvett fuvar zárolása:** a Fuvar szerkesztőben (lásd [10.5](#105-zárolás)).

> **Összefoglalva:**
> - **Zárolt** → az optimalizálás **nem** változtatja meg.
> - **Nem zárolt** (kézzel felvett is) → az optimalizálás **lecserélheti**.

### 8.3 Fedetlen feladatok

A Beosztás fül alján, **Fedetlen feladatok** cím alatt azok a fuvarok vannak, amelyeket senki nem
visz. Pirossal ott a **magyarázat**, például:

- „Nincs jármű elegendő férőhellyel” – nagyobb busz kell, vagy több buszra kell bontani
  (adj meg megállónkénti létszámot).
- „Egyik sofőr sem érhető el …” – bővítsd a sofőrök elérhetőségét.

A fedetlen feladatot az **Áthelyezés** gombbal kézzel is beoszthatod.

---

## 9. A hét áttekintése (Hét fül)

A **Hét** fül a hét **összes edzését** mutatja, napokra bontva, csapatszínekkel.

- A **nyilakkal** előző vagy következő hétre lapozhatsz.
- A **dátumra** kattintva visszaugrasz az aktuális hétre.
- A mai napnál **MA** felirat látszik.

**Egy edzés kártyáján:**
- az edzés időpontja, a csapat neve, a helyszín (egyszeri edzésnél „egyszeri” címke);
- alatta minden **fuvar** egy sorban: **ODA/VISSZA**, rendszám, sofőr, indulási idő.

**Jelzések a kártyán:**

| Jelzés | Jelentése | Mit tegyél? |
|---|---|---|
| **NINCS FUVAR** (sárga) | Az edzéshez nincs egyetlen fuvar sem. | Futtasd az optimalizálást, vagy vegyél fel fuvart kézzel. |
| **ÜTKÖZÉS** (piros) | A sofőrnek vagy a járműnek ekkor másik fuvarja is van. | Nyisd meg, és válassz másik sofőrt vagy járművet. |
| **pl. 12/8 FŐ** (piros) | Több utas, mint férőhely. | Nagyobb jármű kell, vagy több fuvar. |
| **lakat** | A fuvar zárolva van. | – |

A kártyára kattintva megnyílik a **Fuvar szerkesztő**.

---

## 10. Egy fuvar szerkesztése (Fuvar szerkesztő)

Ide a **Hét** fülön egy edzés kártyájára kattintva jutsz.

### 10.1 A fuvarok közötti választás

Ha az edzéshez már van fuvar, fent **gombok** mutatják őket (pl. „1. fuvar · ODA · Anna”).
Kattints arra, amelyiket szerkeszteni szeretnéd, vagy a **＋ Új fuvar** gombra.

A fejléc alatti dobozban látod a csapatot, az irányt, a napot, az edzés idejét és a helyszínt.

### 10.2 Irány, jármű, sofőr

1. **Irány:**
   - **ODA** – a megállókból a helyszínre;
   - **VISSZA** – a helyszínről haza.
   Mentés után az irány **már nem módosítható**. Ha rossz lett, töröld a fuvart, és vedd fel újra.
2. **Jármű \*** – válaszd ki.
3. **Sofőr \*** – válaszd ki.

Ha a jármű vagy a sofőr ekkor **máshol foglalt**, piros figyelmeztetés jelenik meg. Ez csak
figyelmeztetés, a mentést nem tiltja.

### 10.3 Megállók

1. A **＋ Megálló hozzáadása…** listából válassz állomást. Elöl a csapat (vagy az edzés) saját
   megállói vannak, utánuk az **Egyéb állomások**.
2. Minden megállónál megadhatod az **időt** és a **létszámot** (fő).
3. **Sorrend módosítása:** a **fel/le nyilakkal**, vagy számítógépen a bal oldali fogantyúnál fogva
   húzással.
4. Megálló törlése: **X** gomb.

**Segítő gombok:**
- **Idők számítása** – a jelenlegi sorrendhez kiszámolja az időpontokat.
- **Sorrend + idők** – kiszámolja a **leggyorsabb sorrendet** és az időpontokat is.

Mellette látod a célt: odaútnál „Cél: érkezés …-ig”, visszaútnál „Indulás a helyszínről …-kor”.

Jobb oldalt egy címke mutatja az utasok számát a férőhelyekhez képest (pl. „10 / 8 fő”).
Ha piros, túl sok az utas.

### 10.4 Mentés és törlés

- **Fuvar mentése** – csak akkor aktív, ha a jármű és a sofőr ki van választva.
- **Törlés** – két lépésben (lásd [5.7](#57-törlés)).

### 10.5 Zárolás

A sofőr választó alatt van a **„Zárolás — az optimalizálás nem írja felül”** jelölőnégyzet.

- **Bekapcsolva mentve:** a sofőr, a jármű **és a megállók** pontosan így maradnak. Az
  optimalizálás ezt a fuvart nem adja másnak, és nem cseréli le. A Beosztás fülön zárolt
  feladatként látszik.
- **Kikapcsolva mentve:** a fuvar feloldódik, a következő optimalizálás lecserélheti.

**Mikor szürke (nem kapcsolható) a jelölőnégyzet?**
- Ha a csapat erre az útra **több buszra van bontva** – ilyenkor nem egyértelmű, melyik buszról
  van szó. Ezt a Beosztás fülön, a feladatoknál zárold.
- Ha a fuvar egy **egész zárolt láncban** van, amelyben más fuvar is van – a feloldás a Beosztás
  fülön, a lánc fejlécében van.

> **Figyelem:** ha egy **nem zárolt** fuvart kézzel módosítasz, a következő optimalizálás
> felülírhatja. Ha így szeretnéd megtartani, **kapcsold be a zárolást**, mielőtt mentesz.

---

## 11. A sofőr napi nézete (Sofőr fül)

Ezt a nézetet elsősorban a **sofőrök** használják, a telefonjukon. Nagy betűs, könnyen olvasható,
és **csak megtekintésre** szolgál.

- **Sofőr kiválasztása:** fent a nevek közül. Aki sofőrként lép be, és az e-mail címe egyezik a
  sofőr adatlapján megadottal, annak **rögtön a saját napja** nyílik meg.
- **Nap váltása:** a **nyilakkal** előre-hátra. A dátumra kattintva visszaugrasz **mára**
  (ilyenkor **MA** felirat látszik).

**Mit mutat?**
- **kiállás** (szaggatott keretes kártya) – mikor kell indulni a telephelyről, és hova;
- minden **fuvar** külön kártyán: ODA/VISSZA, csapat, edzés ideje, rendszám, létszám;
- a **megállók** nagy betűvel, időponttal, címmel és létszámmal;
- a **helyszín** zölddel: odaútnál „eddigre kell a helyszínen lenni”, visszaútnál „innen indul
  a hazaszállítás”;
- **beállás** – mikor ér vissza a busz a telephelyre.

**A mai napon:**
- a következő megálló mellett **KÖVETKEZŐ** felirat van;
- a már elmúlt megállók halványabbak;
- a nézet **percenként magától frissül**.

> **Tipp sofőröknek:** a telefon kijelzőjét érdemes úgy beállítani, hogy vezetés közben ne
> kapcsoljon ki.

---

## 12. Heti menetrend nyomtatása

Egy kiválasztott sofőr **egész heti** fuvarjait nyomtathatod ki táblázatban.

1. **Beosztás fül → Heti menetrend nyomtatása**. A gomb mellett látod, hány sofőrnek van fuvarja
   a héten. Ha a gomb szürke, a héten még nincs rögzített fuvar – előbb futtasd és alkalmazd a
   heti optimalizálást.
2. Megnyílik a nyomtatási nézet. **Válaszd ki a sofőrt** a listából (csak azok szerepelnek, akiknek
   van fuvarja; a név mellett a fuvarok száma).
3. Kattints a **Menetrend megjelenítése** gombra.
4. Nézd át a táblázatot, majd kattints a **Nyomtatás** gombra. Megnyílik a böngésző nyomtatási
   ablaka – itt választhatod a nyomtatót, vagy a **Mentés PDF-ként** lehetőséget.

**Mit tartalmaz a lap?**
- fent a sofőr **neve**, **telefonszáma** és a **hét**;
- összesítés: **fuvarok száma** és **fizetett idő**;
- a táblázat oszlopai: **Nap · Idő · Feladat · Útvonal · Jármű · Fő**;
- **minden nap** szerepel; ahol nincs munka, ott „Nincs fuvar” áll;
- a nap cellájában a **dátum** és az aznapi **fizetett idő**;
- dőlt betűvel a **Kiállás** és a **Beállás** sorok.

**Hasznos gombok a felső sávban:**
- **Másik sofőr** – visszalépsz a sofőrválasztáshoz;
- **X** – bezárod a nyomtatási nézetet.

> **Jó tudni:** a lap **fekvő A4**-es. Egy nap sosem szakad ketté két oldal között, és a
> táblázat fejléce minden oldalon megismétlődik. A felső gombsor nem kerül rá a papírra.

---

## 13. Felhasználók kezelése

Csak **admin** éri el: **Adatok → Felhasználók**.

Itt döntöd el, ki mit érhet el.

**Új felhasználó felvétele:**
1. Írd be az **e-mail címét**. Ez ugyanaz legyen, amivel a fiókja létre lett hozva.
2. Válaszd ki a **Szerepkört**: **Sofőr** vagy **Admin**.
3. Kattints a **Felvétel** gombra.

**Szerepkör módosítása:** a felhasználó sorában válaszd ki az új szerepkört a legördülő listából.

**Eltávolítás:** kuka gomb, két lépésben. Az eltávolított felhasználó ezután sofőrként léphet be.

> **Jó tudni:**
> - A változás a felhasználó **következő belépésekor** vagy az oldal **újratöltésekor** lép életbe.
> - **Saját magadat** nem tudod lefokozni vagy törölni – így nem zárhatod ki magad véletlenül.
> - A felhasználói **fiókot** (e-mail + jelszó) a fejlesztő hozza létre. Itt csak a
>   jogosultságot állítod be.

---

## 14. Mentés és korábbi mentések

### Automatikus mentés

Minden változtatás **magától mentődik**, néhány tized másodpercen belül. Nem kell semmit tenned.

### Ha valami baj van a mentéssel

- **„A mentés nem sikerült”** (felugró üzenet): valószínűleg megszakadt az internet. Ellenőrizd a
  kapcsolatot, és ismételd meg az utolsó módosítást.
- **„Az adatok máshol módosultak”**: közben **valaki más is mentett** (például egy másik admin egy
  másik gépen). Hogy ne írd felül az ő munkáját, a program letiltja a mentést. Kattints az
  **Újratöltés** gombra, és a legfrissebb adatokkal dolgozz tovább. *Az utolsó, még nem mentett
  változtatásod ilyenkor elveszhet.*
- **„Nem sikerült betölteni”**: hálózati hiba. Az adataid biztonságban vannak. Kattints az
  **Újrapróbálkozás** gombra.

> **Tipp:** egyszerre lehetőleg **csak egy ember** szerkessze az adatokat.

### Korábbi mentések visszaállítása

Ha elrontottál valamit, visszaléphetsz egy korábbi állapotra.

1. A fejlécben kattints a **↺ Korábbi mentések** gombra.
2. Megjelenik a lista (az utolsó **20** mentés): mikor készült, és mennyi csapat, sofőr, jármű,
   edzés és fuvar volt benne.
3. A kívánt sornál kattints a **Visszaállítás** gombra, majd az **Igen** gombra.
4. Az oldal újratöltődik a visszaállított adatokkal.

> **Nyugodtan próbáld ki:** a visszaállítás előtti állapot is bekerül a korábbi mentések közé,
> így ha mégsem az kellett, azt is vissza tudod hozni.

---

## 15. Mintaadatok visszaállítása

Az **Adatok** fül legalján van a **Mintaadatok visszaállítása** gomb. Ez **minden adatot
felülír** bemutató adatokkal.

> **Figyelem!** Éles használat közben **ne nyomd meg**. Ha mégis megtörtént, a
> [Korábbi mentések](#korábbi-mentések-visszaállítása) segítségével visszaállíthatod az előző állapotot.

Két lépésben működik: első kattintásra a felirat „Minden adat felülíródik!”-re vált, és csak a
második kattintás hajtja végre.

---

## 16. Gyakori kérdések és hibaelhárítás

**Csak a Sofőr fület látom. Miért?**
Mert a szerepköröd „Sofőr”. Ha adminisztrátori jog kell, kérd meg egy admint, hogy a
**Felhasználók** listán állítson át.

**Sofőrként belépve nem a saját napomat látom.**
Az adataidnál (Adatok → Sofőrök) az **E-mail (belépéshez)** mezőben pontosan az a cím legyen,
amivel belépsz. Addig is fent a nevedre kattintva kiválaszthatod magad.

**A Hét fülön „NINCS FUVAR” áll az edzésnél.**
Még nem készült beosztás, vagy nem alkalmaztad. Menj a **Beosztás** fülre, futtasd a **Heti
beosztás optimalizálása** gombot, és kattints az **Alkalmazás és fuvarok rögzítése** gombra. Ha
utána is ott áll, nézd meg a **Fedetlen feladatokat** és a **figyelmeztetéseket**.

**Egy csapathoz egyáltalán nem készül feladat.**
Nézd meg a Beosztás fülön a **figyelmeztetéseket**. A leggyakoribb okok:
- a csapathoz nincs állomás rendelve;
- nincs megadva létszám (se megállónként, se összesen);
- minden megállónál 0 fő szerepel.

**Kézzel beállítottam egy fuvart, de az optimalizálás átírta.**
Mert nem volt **zárolva**. Nyisd meg a fuvart, kapcsold be a **Zárolás** jelölőt, és mentsd.
Vagy a Beosztás fülön zárold a feladatot, illetve a láncot.

**Az utazási idők nem stimmelnek.**
- Ellenőrizd, hogy a pontok **koordinátái** jó helyen vannak-e.
- Kattints a **Mátrix** gombra, hogy friss közúti menetidők legyenek.

**Túl magas a költség / sokat vár a sofőr.**
- Ellenőrizd, hogy van-e **telephely** megadva.
- Nézd meg a sofőrök **Min. műszak** és **Órabér** értékét.
- A **Paraméterekben** az **Üresjárat költsége** és a **Kiszállási díj** is befolyásolja az eredményt.

**Egy sofőr sokkal több munkát kap, mint a többiek.**
- Nézd meg az elérhetőségét: aki szinte mindig ráér, az több munkát kaphat.
- A **Paraméterekben** növeld az **Egyenletes terhelés súlyát**.

**Nem tudok törölni egy állomást, járművet vagy helyszínt.**
Valami még használja. A program megírja, hány helyen („Használatban: …”). Előbb onnan vedd ki.

**Nem jelenik meg a térkép.**
Gyenge vagy tiltott internetkapcsolatnál egyszerűsített térkép jelenik meg. A koordinátát
beillesztheted kézzel is (pl. a Google Térképről kimásolva): `46.25311, 20.14503`.

**Szürke a nyomtatás gomb.**
A héten még egyik sofőrnek sincs rögzített fuvarja. Futtasd és alkalmazd a heti optimalizálást.

**Véletlenül töröltem vagy elrontottam valamit.**
Használd a **↺ Korábbi mentések** gombot a fejlécben (lásd [14](#korábbi-mentések-visszaállítása)).

---

## 17. Fogalomtár

| Fogalom | Jelentése |
|---|---|
| **Állomás** | Megálló, ahol a sportolók fel- vagy leszállnak. |
| **Helyszín** | Ahol az edzés van. |
| **Telephely** | Ahol a busz áll; innen indul és ide tér vissza. |
| **ODA** | Út a megállókból a helyszínre. |
| **VISSZA** | Út a helyszínről haza, a megállókba. |
| **Feladat** | Egy csapat egy útja egy napon (pl. U12 Lány, kedd, ODA). |
| **Fuvar** | Egy konkrét út, amelyhez sofőr, jármű és megállók tartoznak. Ezt látják a sofőrök. |
| **Lánc** | Egy sofőr egy járművel egymás után elvégzett feladatai. |
| **Műszak** | Egy sofőr egy kiállása: a telephelyről indulástól a visszaérkezésig. |
| **Kiállás** | Indulás a telephelyről. |
| **Beállás** | Visszaérkezés a telephelyre. |
| **Üresjárat** | Utas nélküli út (pl. a telephelyről az első megállóig). |
| **Várakozás** | Idő, amíg a sofőr két fuvar között a helyszínen vár. |
| **Fizetett idő** | Amennyi időt a klub kifizet; legalább a minimális műszak. |
| **Kiszállási díj** | Egyszeri díj minden műszakért. |
| **Optimalizálás** | A program kiszámolja a legolcsóbb és legarányosabb beosztást. |
| **Zárolás** | Jelzés, hogy ezt az optimalizálás nem változtathatja meg. |
| **Fedetlen feladat** | Olyan út, amelyet senki nem visz. |
| **Mátrix** | Az összes pont közötti valós menetidők táblázata. |
| **Országos matrica** | Autópálya-matrica; egyes helyszínekre csak ilyen járművel lehet menni. |
| **Admin** | Mindent láthat és szerkeszthet. |
| **Sofőr (szerepkör)** | Csak a Sofőr fület látja, semmit nem módosíthat. |
