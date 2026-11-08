// Most Likely Boom questions: the start ("Who is most likely to") plus one ending per line.
// Endings are full phrases so each language can keep its own word order.

const lines = (text) => text.split("\n").map((l) => l.trim()).filter(Boolean);

export const QUESTIONS = {
  en: {
    start: "Who is most likely to …",
    endings: lines(`
      forget their own birthday?
      become famous?
      become a millionaire?
      end up on a reality show?
      get lost in their own city?
      fall asleep at a party?
      laugh at the worst possible moment?
      cry during a cartoon?
      eat something off the floor?
      text their ex at 3 a.m.?
      run a marathon?
      survive a zombie apocalypse?
      be the first to die in a horror movie?
      adopt ten cats?
      move to another country on a whim?
      win the lottery and lose the ticket?
      talk their way out of a speeding ticket?
      sing in the shower the loudest?
      start a dance-off in a supermarket?
      lock themselves out of the house?
      forget where they parked?
      spend all their money in one day?
      become a teacher?
      write a bestseller?
      get a tattoo they regret?
      be late to their own wedding?
      cheat at a board game?
      cry at a wedding?
      say something embarrassing on a video call?
      send a message to the wrong group chat?
      binge a whole series in one weekend?
      wake up before 6 a.m. by choice?
      eat pizza for breakfast?
      climb a mountain?
      go skydiving?
      become a politician?
      believe a fake news story?
      fall for a prank?
      plan the perfect surprise party?
      forget a friend's name?
      trip over nothing?
      have the messiest room?
      keep a plant alive for ten years?
      kill a cactus?
      burn water while cooking?
      open a restaurant?
      become a YouTuber?
      go viral by accident?
      get kicked out of a museum?
      talk to animals like they're people?
      fall in love on holiday?
      marry someone they met online?
      have twelve kids?
      live in a tiny house?
      move to a farm?
      win a game show?
      become a detective?
      know all the gossip first?
      keep a secret forever?
      spill a secret within an hour?
      laugh at their own jokes?
      tell the worst jokes?
      start an argument about nothing?
      apologise to a chair after bumping into it?
      buy something useless on the internet?
      collect something weird?
      get stuck in an elevator?
      take a hundred selfies a day?
      lose their phone while holding it?
      fall asleep in the cinema?
      eat the last piece without asking?
      show up in pyjamas?
      forget to reply for a week?
      reply to every message in seconds?
      have a secret talent?
      become a professional athlete?
      join a circus?
      learn five languages?
      sleep through an alarm?
      get a sunburn on a cloudy day?
      spend hours choosing a film and then not watch it?
      cry when their team loses?
      dance on a table?
      be the last one to leave the party?
      be the first one to leave the party?
      organise everything with spreadsheets?
      lose their keys every day?
      get scared by their own shadow?
      scream at a spider?
      rescue a stranger's cat from a tree?
      win an argument with a teacher?
      become the boss one day?
      quit their job to travel the world?
      fake being sick to stay at home?
      go to a concert alone?
      know every lyric of every song?
      sing karaoke without being asked?
      bring way too much food to a picnic?
      eat dessert first?
      try every flavour of ice cream?
      survive a week without their phone?
      survive a week in the wild?
      get lost in IKEA?
      buy a sports car?
      drive a tractor to work?
      build their own house?
      invent something useful?
      break something in a shop?
      accidentally like an old photo while stalking?
      wear socks with sandals?
      have the weirdest dreams?
      talk in their sleep?
      sleepwalk to the fridge?
      get a cold every winter?
      own the most shoes?
      wear the same outfit three days in a row?
      dye their hair a crazy colour?
      grow a moustache?
      start a band?
      become a meme?
      write a love letter?
      remember every birthday?
      give the best presents?
      give the worst presents?
      re-gift a present?
      stay calm in an emergency?
      panic in an emergency?
      haggle at a flea market?
      lose at rock paper scissors?
      win every board game?
      become a millionaire and still be stingy?
      lend money and forget about it?
      forget to bring their wallet?
      order the same thing every time?
      try the weirdest dish on the menu?
      fall off a chair?
      get recognised on the street one day?
      become an astronaut?
      believe in aliens?
      see a ghost?
      stay up all night talking?
      start a conversation with a stranger?
      be friends with their neighbours?
      have a hundred browser tabs open?
      still have their childhood teddy bear?
      cry while watching an advert?
      read the ending of a book first?
      spoil the end of a film?
    `),
  },
  de: {
    start: "Wer würde am ehesten …",
    endings: lines(`
      den eigenen Geburtstag vergessen?
      berühmt werden?
      Millionär werden?
      in einer Reality-Show landen?
      sich in der eigenen Stadt verlaufen?
      an einer Party einschlafen?
      im unpassendsten Moment lachen?
      bei einem Zeichentrickfilm weinen?
      etwas vom Boden essen?
      um 3 Uhr nachts dem Ex schreiben?
      einen Marathon laufen?
      eine Zombie-Apokalypse überleben?
      im Horrorfilm als Erstes sterben?
      zehn Katzen adoptieren?
      spontan auswandern?
      im Lotto gewinnen und den Schein verlieren?
      sich aus einer Busse herausreden?
      unter der Dusche am lautesten singen?
      im Supermarkt einen Tanz-Battle starten?
      sich aus der eigenen Wohnung aussperren?
      vergessen, wo das Auto parkiert ist?
      das ganze Geld an einem Tag ausgeben?
      Lehrer werden?
      einen Bestseller schreiben?
      ein Tattoo bereuen?
      zur eigenen Hochzeit zu spät kommen?
      bei einem Brettspiel schummeln?
      an einer Hochzeit weinen?
      in einem Videocall etwas Peinliches sagen?
      eine Nachricht in den falschen Gruppenchat schicken?
      eine ganze Serie an einem Wochenende schauen?
      freiwillig vor 6 Uhr aufstehen?
      Pizza zum Frühstück essen?
      einen Viertausender besteigen?
      Fallschirm springen?
      in die Politik gehen?
      auf Fake News hereinfallen?
      auf einen Streich hereinfallen?
      die perfekte Überraschungsparty planen?
      den Namen von einem Freund vergessen?
      über nichts stolpern?
      das unordentlichste Zimmer haben?
      eine Pflanze zehn Jahre am Leben halten?
      einen Kaktus sterben lassen?
      beim Kochen Wasser anbrennen lassen?
      ein Restaurant eröffnen?
      YouTuber werden?
      aus Versehen viral gehen?
      aus einem Museum geworfen werden?
      mit Tieren reden wie mit Menschen?
      sich in den Ferien verlieben?
      jemanden aus dem Internet heiraten?
      zwölf Kinder haben?
      in einem Tiny House wohnen?
      auf einen Bauernhof ziehen?
      eine Quizshow gewinnen?
      Detektiv werden?
      den neusten Klatsch als Erstes wissen?
      ein Geheimnis für immer behalten?
      ein Geheimnis innert einer Stunde ausplaudern?
      über die eigenen Witze lachen?
      die schlechtesten Witze erzählen?
      wegen nichts einen Streit anfangen?
      sich bei einem Stuhl entschuldigen, nachdem man ihn angerempelt hat?
      etwas Nutzloses im Internet bestellen?
      etwas Seltsames sammeln?
      im Lift stecken bleiben?
      hundert Selfies am Tag machen?
      das Handy suchen, während es in der Hand ist?
      im Kino einschlafen?
      das letzte Stück essen, ohne zu fragen?
      im Pyjama auftauchen?
      eine Woche lang nicht auf Nachrichten antworten?
      jede Nachricht innert Sekunden beantworten?
      ein geheimes Talent haben?
      Profisportler werden?
      zum Zirkus gehen?
      fünf Sprachen lernen?
      den Wecker verschlafen?
      bei bewölktem Himmel einen Sonnenbrand bekommen?
      stundenlang einen Film aussuchen und dann keinen schauen?
      weinen, wenn das Lieblingsteam verliert?
      auf dem Tisch tanzen?
      als Letztes die Party verlassen?
      als Erstes die Party verlassen?
      alles mit Excel-Tabellen organisieren?
      jeden Tag die Schlüssel verlieren?
      vor dem eigenen Schatten erschrecken?
      wegen einer Spinne schreien?
      eine fremde Katze vom Baum retten?
      eine Diskussion mit dem Lehrer gewinnen?
      eines Tages Chef werden?
      kündigen, um die Welt zu bereisen?
      krank spielen, um zu Hause zu bleiben?
      allein an ein Konzert gehen?
      jeden Songtext auswendig können?
      ungefragt Karaoke singen?
      viel zu viel Essen ans Picknick mitbringen?
      das Dessert zuerst essen?
      jede Glacesorte probieren?
      eine Woche ohne Handy überleben?
      eine Woche in der Wildnis überleben?
      sich im IKEA verlaufen?
      einen Sportwagen kaufen?
      mit dem Traktor zur Arbeit fahren?
      das eigene Haus bauen?
      etwas Nützliches erfinden?
      in einem Laden etwas kaputt machen?
      beim Stalken aus Versehen ein altes Foto liken?
      Socken in Sandalen tragen?
      die seltsamsten Träume haben?
      im Schlaf reden?
      schlafwandelnd zum Kühlschrank gehen?
      jeden Winter erkältet sein?
      die meisten Schuhe besitzen?
      drei Tage lang das gleiche Outfit tragen?
      die Haare in einer verrückten Farbe färben?
      sich einen Schnauz wachsen lassen?
      eine Band gründen?
      zu einem Meme werden?
      einen Liebesbrief schreiben?
      sich an jeden Geburtstag erinnern?
      die besten Geschenke machen?
      die schlechtesten Geschenke machen?
      ein Geschenk weiterverschenken?
      im Notfall ruhig bleiben?
      im Notfall in Panik geraten?
      auf dem Flohmarkt feilschen?
      bei Schere-Stein-Papier verlieren?
      jedes Brettspiel gewinnen?
      reich werden und trotzdem geizig bleiben?
      Geld ausleihen und es vergessen?
      das Portemonnaie zu Hause vergessen?
      jedes Mal das Gleiche bestellen?
      das seltsamste Gericht auf der Karte probieren?
      vom Stuhl fallen?
      eines Tages auf der Strasse erkannt werden?
      Astronaut werden?
      an Ausserirdische glauben?
      einen Geist sehen?
      die ganze Nacht durchquatschen?
      mit Fremden ein Gespräch anfangen?
      mit den Nachbarn befreundet sein?
      hundert Browser-Tabs offen haben?
      noch den Teddybär aus der Kindheit haben?
      bei einer Werbung weinen?
      zuerst das Ende eines Buches lesen?
      das Ende eines Films verraten?
    `),
  },
};
