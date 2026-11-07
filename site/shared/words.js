// Word lists for the word games (Odd Word Out, Guess the Word), plus helpers to pick
// words without repeats. One list per language; categories share ids across languages,
// so a category choice carries over when the language changes. Words are comma separated.

const cat = (id, name, words) => ({ id, name, words: words.split(",").map((w) => w.trim()).filter(Boolean) });

export const WORDS = {
  en: [
    cat("animals", "Animals", `Dog, Cat, Horse, Cow, Pig, Sheep, Goat, Chicken, Duck, Rabbit, Hamster, Mouse, Rat,
      Squirrel, Hedgehog, Fox, Wolf, Bear, Deer, Moose, Lion, Tiger, Leopard, Cheetah, Elephant, Giraffe, Zebra,
      Hippo, Rhino, Monkey, Gorilla, Kangaroo, Koala, Panda, Camel, Crocodile, Snake, Turtle, Frog, Lizard,
      Shark, Whale, Dolphin, Octopus, Jellyfish, Crab, Penguin, Owl, Eagle, Parrot, Flamingo, Swan, Bat, Bee,
      Butterfly, Spider, Ant, Snail, Seal, Otter, Beaver, Raccoon, Peacock, Donkey`),
    cat("food", "Food & drink", `Pizza, Pasta, Spaghetti, Burger, Hot dog, Sandwich, Sushi, Taco, Kebab, Lasagna,
      Pancake, Waffle, Croissant, Bread, Pretzel, Cheese, Butter, Egg, Bacon, Sausage, Steak, Fries, Mashed potatoes,
      Rice, Soup, Salad, Popcorn, Chocolate, Ice cream, Cake, Cookie, Donut, Muffin, Apple, Banana, Strawberry,
      Watermelon, Pineapple, Lemon, Orange, Grapes, Cherry, Carrot, Tomato, Cucumber, Onion, Garlic, Mushroom,
      Avocado, Honey, Jam, Yogurt, Cereal, Coffee, Tea, Milk, Orange juice, Lemonade, Hot chocolate, Fondue,
      Raclette, Curry, Dumpling, Omelette`),
    cat("places", "Places", `Beach, Airport, Train station, Hospital, School, Library, Museum, Cinema, Theater,
      Supermarket, Bakery, Restaurant, Café, Hotel, Campsite, Zoo, Aquarium, Circus, Amusement park, Stadium,
      Gym, Swimming pool, Sauna, Church, Castle, Prison, Police station, Fire station, Post office, Bank,
      Farm, Forest, Desert, Island, Jungle, Volcano, Cave, Mountain hut, Ski resort, Lighthouse, Harbor,
      Submarine, Space station, Pirate ship, Cruise ship, Nightclub, Wedding, Hairdresser, Dentist, Car wash,
      Gas station, Parking garage, Playground, Cemetery, Laundromat, Bowling alley, Casino, Office, Elevator, Rooftop`),
    cat("jobs", "Jobs", `Doctor, Nurse, Teacher, Police officer, Firefighter, Pilot, Flight attendant, Chef, Waiter,
      Baker, Butcher, Farmer, Fisherman, Carpenter, Plumber, Electrician, Mechanic, Painter, Architect, Engineer,
      Programmer, Scientist, Astronaut, Judge, Lawyer, Journalist, Photographer, Actor, Singer, Dancer, Musician,
      DJ, Clown, Magician, Hairdresser, Dentist, Vet, Pharmacist, Postman, Taxi driver, Bus driver, Truck driver,
      Soldier, Spy, Detective, Lifeguard, Gardener, Librarian, Cashier, Banker, Tour guide, Priest, Referee,
      Zookeeper, Beekeeper, Tailor, Locksmith, Window cleaner, Streamer, Archaeologist`),
    cat("home", "At home", `Sofa, Bed, Pillow, Blanket, Table, Chair, Lamp, Mirror, Carpet, Curtain, Bookshelf,
      Wardrobe, Fridge, Freezer, Oven, Microwave, Toaster, Kettle, Coffee machine, Dishwasher, Washing machine,
      Vacuum cleaner, Iron, Broom, Bucket, Sponge, Towel, Bathtub, Shower, Toilet, Toothbrush, Toothpaste, Soap,
      Hair dryer, Alarm clock, Television, Remote control, Doorbell, Key, Window, Stairs, Plant, Vase, Candle,
      Picture frame, Fork, Knife, Spoon, Plate, Cup, Frying pan, Cooking pot, Cutting board, Trash can,
      Light switch, Radiator, Fireplace, Laundry basket, Clothes peg, Coat hanger`),
    cat("sports", "Sports & games", `Football, Basketball, Tennis, Table tennis, Badminton, Volleyball, Handball,
      Ice hockey, Golf, Baseball, Rugby, Boxing, Wrestling, Judo, Karate, Fencing, Archery, Skiing, Snowboarding,
      Ice skating, Surfing, Sailing, Rowing, Canoeing, Swimming, Diving, Climbing, Cycling, Skateboarding,
      Marathon, Sprint, High jump, Long jump, Gymnastics, Yoga, Darts, Bowling, Billiards, Chess, Poker, Bingo,
      Hide and seek, Tag, Tug of war, Hula hoop, Frisbee, Kite flying, Trampoline, Minigolf, Paintball, Curling,
      Bobsleigh, Horse riding, Water polo, Triathlon, Sumo, Jigsaw puzzle, Dominoes, Card game, Rock paper scissors`),
    cat("transport", "Transport", `Car, Bus, Train, Tram, Subway, Bicycle, Motorbike, Scooter, Skateboard, Truck,
      Tractor, Taxi, Ambulance, Fire truck, Police car, Limousine, Camper van, Airplane, Helicopter, Hot air balloon,
      Rocket, Glider, Parachute, Boat, Ship, Ferry, Sailboat, Canoe, Kayak, Jet ski, Gondola, Cable car, Chairlift,
      Sled, Snowmobile, Horse carriage, Rickshaw, Segway, Roller skates, Unicycle, Tandem, Monster truck, Race car,
      Excavator, Forklift, Steamroller, Zeppelin, Spaceship, Escalator, Shopping cart, Wheelbarrow, Stroller,
      Tank, Hovercraft, Raft, Container ship, Double-decker bus, Night train, Go-kart, Tow truck`),
    cat("nature", "Nature & weather", `Sun, Moon, Star, Cloud, Rain, Snow, Hail, Fog, Thunderstorm, Lightning,
      Rainbow, Wind, Tornado, Hurricane, Earthquake, Flood, Avalanche, Heatwave, Icicle, Snowflake, River, Lake,
      Ocean, Waterfall, Glacier, Iceberg, Mountain, Hill, Valley, Beach, Sand dune, Cliff, Rock, Pebble, Tree,
      Flower, Rose, Sunflower, Cactus, Mushroom, Moss, Grass, Leaf, Acorn, Pine cone, Palm tree, Bamboo, Puddle,
      Mud, Sunset, Sunrise, Eclipse, Comet, Meteor, Northern lights, Fire, Smoke, Wave, Swamp, Geyser`),
    cat("clothing", "Clothing", `T-shirt, Shirt, Blouse, Sweater, Hoodie, Jacket, Coat, Raincoat, Dress, Skirt,
      Trousers, Jeans, Shorts, Leggings, Pyjamas, Bathrobe, Swimsuit, Bikini, Underwear, Socks, Tights, Shoes,
      Sneakers, Boots, Sandals, Flip-flops, Slippers, High heels, Hat, Cap, Beanie, Scarf, Gloves, Mittens, Tie,
      Bow tie, Belt, Suit, Uniform, Apron, Vest, Overalls, Tracksuit, Wedding dress, Costume, Sunglasses,
      Glasses, Watch, Ring, Necklace, Earrings, Bracelet, Backpack, Handbag, Wallet, Umbrella, Crown, Helmet,
      Kilt, Poncho`),
    cat("music", "Music & art", `Guitar, Piano, Violin, Cello, Drums, Flute, Trumpet, Saxophone, Harmonica,
      Accordion, Harp, Triangle, Xylophone, Bagpipes, Alphorn, Ukulele, Microphone, Headphones, Speaker, Concert,
      Orchestra, Choir, Band, Opera, Karaoke, Festival, Music video, Lullaby, National anthem, Ballet,
      Breakdance, Disco, Painting, Sculpture, Drawing, Graffiti, Comic, Photo, Selfie, Statue, Mosaic, Pottery,
      Origami, Paintbrush, Crayon, Easel, Canvas, Gallery, Poem, Novel, Fairy tale, Magic trick, Puppet show,
      Circus act, Stand-up comedy, Movie, Cartoon, Podcast, Radio, Record player`),
    cat("leisure", "Hobbies & leisure", `Camping, Hiking, Fishing, Gardening, Cooking, Baking, Knitting, Sewing,
      Reading, Writing, Painting, Photography, Dancing, Singing, Gaming, Juggling, Birdwatching, Stargazing,
      Picnic, Barbecue, Sunbathing, Sightseeing, Road trip, Backpacking, Cruise, Shopping, Board game night,
      Escape room, Bonfire, Sleepover, Movie night, Spa day, Yoga class, Jogging, Bird feeder, Sandcastle,
      Snowman, Snowball fight, Pillow fight, Water balloon, Treasure hunt, Crossword, Sudoku, Model railway,
      Stamp collecting, Lego, Video call, Binge watching, Napping, Window shopping, Flea market, Car boot sale,
      Pub quiz, Theme park, Zoo visit, Museum tour, Wine tasting, Fireworks, Magic show, Volunteering`),
    cat("geography", "Countries & cities", `Switzerland, Germany, Austria, France, Italy, Spain, Portugal,
      England, Ireland, Scotland, Iceland, Norway, Sweden, Finland, Denmark, Netherlands, Belgium, Greece,
      Turkey, Egypt, Morocco, South Africa, Kenya, India, China, Japan, South Korea, Thailand, Australia,
      New Zealand, Canada, USA, Mexico, Brazil, Argentina, Peru, Russia, Poland, Hungary, Croatia, Paris, London,
      Rome, Venice, Berlin, Vienna, Zurich, Geneva, New York, Las Vegas, Hollywood, Tokyo, Dubai, Sydney,
      Rio de Janeiro, Antarctica, North Pole, Sahara, Amazon, Alps`),
    cat("school", "School & work", `Pencil, Pen, Eraser, Ruler, Sharpener, Scissors, Glue, Notebook, Backpack,
      Calculator, Blackboard, Whiteboard, Chalk, Homework, Exam, Report card, Timetable, Break time, Recess,
      Gym class, School bus, Teacher's desk, Globe, Map, Dictionary, Textbook, Library card, Laptop, Printer,
      Stapler, Paper clip, Post-it, Folder, Meeting, Presentation, Coffee break, Lunch box, Canteen, Deadline,
      Email, Spreadsheet, Job interview, Salary, Holiday, Overtime, Boss, Colleague, Intern, Office chair,
      Desk lamp, Name tag, Business card, Video conference, Elevator pitch, Diploma, Graduation, Field trip,
      Class photo, Detention, Science fair`),
    cat("holidays", "Parties & holidays", `Birthday, Christmas, Easter, Halloween, New Year's Eve, Valentine's Day,
      Carnival, Wedding, Baby shower, Graduation party, Anniversary, Funeral, Christmas tree, Advent calendar,
      Santa Claus, Reindeer, Snowman, Easter egg, Easter bunny, Pumpkin, Costume, Mask, Fireworks, Champagne,
      Birthday cake, Candles, Balloons, Confetti, Party hat, Piñata, Present, Wrapping paper, Greeting card,
      Bouquet, Wedding ring, Honeymoon, Bachelor party, Surprise party, Barbecue party, Pool party, Garden party,
      Karaoke night, Dance floor, Buffet, Toast, Guest list, Invitation, Party games, Trick or treat, Bonfire night,
      Lantern, Mistletoe, Gingerbread, Chocolate egg, Mulled wine, Christmas market, Oktoberfest, Parade,
      Fancy dress, Countdown`),
    cat("fantasy", "Fantasy & stories", `Dragon, Unicorn, Wizard, Witch, Fairy, Elf, Dwarf, Giant, Troll, Goblin,
      Ghost, Vampire, Zombie, Werewolf, Mummy, Mermaid, Pirate, Knight, Princess, Prince, King, Queen, Castle,
      Treasure chest, Magic wand, Crystal ball, Flying carpet, Time machine, Robot, Alien, UFO, Superhero,
      Villain, Monster, Yeti, Loch Ness monster, Phoenix, Genie, Magic lamp, Spell book, Potion, Haunted house,
      Secret passage, Invisibility cloak, Treasure map, Sleeping beauty, Gingerbread house, Glass slipper,
      Poisoned apple, Talking mirror, Beanstalk, Ninja, Samurai, Viking, Cowboy, Gladiator, Caveman, Dinosaur,
      Mad scientist, Fortune teller`),
    cat("body", "Body & health", `Heart, Brain, Lungs, Stomach, Bone, Skeleton, Skull, Tooth, Tongue, Nose, Ear,
      Eye, Eyebrow, Eyelash, Hair, Beard, Moustache, Hand, Finger, Thumb, Fingernail, Elbow, Knee, Foot, Toe,
      Belly button, Shoulder, Neck, Back, Muscle, Blood, Sneeze, Hiccups, Yawn, Cough, Fever, Cold, Headache,
      Sunburn, Freckles, Tattoo, Plaster, Bandage, Crutches, Wheelchair, Pill, Syringe, Thermometer,
      Stethoscope, X-ray, Ambulance, Operation, Braces, Contact lenses, Massage, Nap, Dream, Nightmare,
      Tickle, Goosebumps`),
    cat("tech", "Tech & tools", `Smartphone, Laptop, Tablet, Keyboard, Mouse, Monitor, Printer, Camera, Drone,
      Smartwatch, Game console, Joystick, Virtual reality, Charger, Battery, Power bank, USB stick, Cable, Wi-Fi,
      Bluetooth, Password, App, Website, Emoji, Hashtag, Selfie stick, Robot vacuum, Satellite, Telescope,
      Microscope, Magnifying glass, Compass, Flashlight, Hammer, Nail, Screw, Screwdriver, Drill, Saw, Wrench,
      Pliers, Tape measure, Ladder, Shovel, Rake, Lawn mower, Chainsaw, Toolbox, Duct tape, Glue gun, Padlock,
      Magnet, Light bulb, Solar panel, Wind turbine, Extension cord, Calculator, Walkie-talkie, Typewriter,
      Fax machine`),
  ],
  de: [
    cat("animals", "Tiere", `Hund, Katze, Pferd, Kuh, Schwein, Schaf, Ziege, Huhn, Ente, Hase, Hamster, Maus,
      Ratte, Eichhörnchen, Igel, Fuchs, Wolf, Bär, Reh, Elch, Löwe, Tiger, Leopard, Gepard, Elefant, Giraffe,
      Zebra, Nilpferd, Nashorn, Affe, Gorilla, Känguru, Koala, Panda, Kamel, Krokodil, Schlange, Schildkröte,
      Frosch, Eidechse, Hai, Wal, Delfin, Krake, Qualle, Krabbe, Pinguin, Eule, Adler, Papagei, Flamingo, Schwan,
      Fledermaus, Biene, Schmetterling, Spinne, Ameise, Schnecke, Robbe, Otter, Biber, Waschbär, Pfau, Esel,
      Murmeltier, Steinbock`),
    cat("food", "Essen & Trinken", `Pizza, Pasta, Spaghetti, Burger, Hotdog, Sandwich, Sushi, Taco, Döner,
      Lasagne, Pfannkuchen, Waffel, Gipfeli, Brot, Brezel, Käse, Butter, Ei, Speck, Wurst, Bratwurst, Steak,
      Pommes, Kartoffelstock, Rösti, Reis, Suppe, Salat, Popcorn, Schokolade, Glace, Torte, Guetzli, Donut,
      Muffin, Apfel, Banane, Erdbeere, Wassermelone, Ananas, Zitrone, Orange, Trauben, Kirsche, Karotte,
      Tomate, Gurke, Zwiebel, Knoblauch, Pilz, Avocado, Honig, Konfitüre, Joghurt, Müesli, Kaffee, Tee, Milch,
      Orangensaft, Limonade, Heisse Schokolade, Fondue, Raclette, Curry, Maultaschen, Spätzle, Omelett, Zopf,
      Bircher Müesli, Apfelstrudel`),
    cat("places", "Orte", `Strand, Flughafen, Bahnhof, Spital, Schule, Bibliothek, Museum, Kino, Theater,
      Supermarkt, Bäckerei, Restaurant, Café, Hotel, Campingplatz, Zoo, Aquarium, Zirkus, Freizeitpark, Stadion,
      Fitnessstudio, Schwimmbad, Sauna, Kirche, Burg, Gefängnis, Polizeiwache, Feuerwehr, Post, Bank,
      Bauernhof, Wald, Wüste, Insel, Dschungel, Vulkan, Höhle, Berghütte, Skigebiet, Leuchtturm, Hafen,
      U-Boot, Raumstation, Piratenschiff, Kreuzfahrtschiff, Disco, Hochzeit, Coiffeur, Zahnarzt, Waschanlage,
      Tankstelle, Parkhaus, Spielplatz, Friedhof, Waschsalon, Bowlingbahn, Casino, Büro, Lift, Dachterrasse,
      Bergbahn, Badi`),
    cat("jobs", "Berufe", `Arzt, Pflegefachfrau, Lehrer, Polizist, Feuerwehrmann, Pilot, Flugbegleiterin, Koch,
      Kellner, Bäcker, Metzger, Bauer, Fischer, Schreiner, Sanitär, Elektriker, Mechaniker, Maler, Architekt,
      Ingenieur, Programmierer, Wissenschaftler, Astronaut, Richter, Anwalt, Journalist, Fotograf, Schauspieler,
      Sänger, Tänzer, Musiker, DJ, Clown, Zauberer, Coiffeuse, Zahnarzt, Tierarzt, Apotheker, Pöstler,
      Taxifahrer, Busfahrer, Lastwagenfahrer, Soldat, Spion, Detektiv, Bademeister, Gärtner, Bibliothekar,
      Kassiererin, Banker, Reiseleiter, Pfarrer, Schiedsrichter, Tierpfleger, Imker, Schneider, Schlüsseldienst,
      Fensterputzer, Streamer, Archäologe, Kaminfeger, Bergführer`),
    cat("home", "Im Haushalt", `Sofa, Bett, Kissen, Decke, Tisch, Stuhl, Lampe, Spiegel, Teppich, Vorhang,
      Bücherregal, Kleiderschrank, Kühlschrank, Tiefkühler, Backofen, Mikrowelle, Toaster, Wasserkocher,
      Kaffeemaschine, Geschirrspüler, Waschmaschine, Staubsauger, Bügeleisen, Besen, Eimer, Schwamm, Handtuch,
      Badewanne, Dusche, Toilette, Zahnbürste, Zahnpasta, Seife, Föhn, Wecker, Fernseher, Fernbedienung,
      Türklingel, Schlüssel, Fenster, Treppe, Zimmerpflanze, Vase, Kerze, Bilderrahmen, Gabel, Messer, Löffel,
      Teller, Tasse, Bratpfanne, Kochtopf, Schneidebrett, Abfalleimer, Lichtschalter, Heizung, Cheminée,
      Wäschekorb, Wäscheklammer, Kleiderbügel`),
    cat("sports", "Sport & Spiele", `Fussball, Basketball, Tennis, Tischtennis, Badminton, Volleyball, Handball,
      Eishockey, Golf, Baseball, Rugby, Boxen, Ringen, Judo, Karate, Fechten, Bogenschiessen, Skifahren,
      Snowboarden, Eislaufen, Surfen, Segeln, Rudern, Kanufahren, Schwimmen, Tauchen, Klettern, Velofahren,
      Skateboarden, Marathon, Sprint, Hochsprung, Weitsprung, Turnen, Yoga, Darts, Bowling, Billard, Schach,
      Poker, Bingo, Versteckis, Fangis, Seilziehen, Hula-Hoop, Frisbee, Drachensteigen, Trampolin, Minigolf,
      Paintball, Curling, Bob, Reiten, Wasserball, Triathlon, Sumo, Puzzle, Domino, Jassen, Schere Stein Papier,
      Schwingen, Hornussen`),
    cat("transport", "Verkehr", `Auto, Bus, Zug, Tram, U-Bahn, Velo, Motorrad, Roller, Skateboard, Lastwagen,
      Traktor, Taxi, Krankenwagen, Feuerwehrauto, Polizeiauto, Limousine, Wohnmobil, Flugzeug, Helikopter,
      Heissluftballon, Rakete, Segelflugzeug, Fallschirm, Boot, Schiff, Fähre, Segelboot, Kanu, Kajak, Jetski,
      Gondel, Seilbahn, Sessellift, Schlitten, Schneemobil, Kutsche, Rikscha, Segway, Rollschuhe, Einrad,
      Tandem, Monstertruck, Rennauto, Bagger, Gabelstapler, Dampfwalze, Zeppelin, Raumschiff, Rolltreppe,
      Einkaufswagen, Schubkarre, Kinderwagen, Panzer, Luftkissenboot, Floss, Containerschiff, Doppelstockbus,
      Nachtzug, Gokart, Abschleppwagen, Postauto, Zahnradbahn`),
    cat("nature", "Natur & Wetter", `Sonne, Mond, Stern, Wolke, Regen, Schnee, Hagel, Nebel, Gewitter, Blitz,
      Regenbogen, Wind, Tornado, Hurrikan, Erdbeben, Hochwasser, Lawine, Hitzewelle, Eiszapfen, Schneeflocke,
      Fluss, See, Ozean, Wasserfall, Gletscher, Eisberg, Berg, Hügel, Tal, Sanddüne, Klippe, Felsen, Kieselstein,
      Baum, Blume, Rose, Sonnenblume, Kaktus, Moos, Gras, Blatt, Eichel, Tannzapfen, Palme, Bambus, Pfütze,
      Schlamm, Sonnenuntergang, Sonnenaufgang, Sonnenfinsternis, Komet, Sternschnuppe, Polarlicht, Feuer,
      Rauch, Welle, Sumpf, Geysir, Edelweiss, Föhnsturm`),
    cat("clothing", "Kleidung", `T-Shirt, Hemd, Bluse, Pullover, Hoodie, Jacke, Mantel, Regenjacke, Kleid, Rock,
      Hose, Jeans, Shorts, Leggings, Pyjama, Bademantel, Badeanzug, Bikini, Unterhose, Socken, Strumpfhose,
      Schuhe, Turnschuhe, Stiefel, Sandalen, Flipflops, Finken, Stöckelschuhe, Hut, Mütze, Kappe, Schal,
      Handschuhe, Fäustlinge, Krawatte, Fliege, Gürtel, Anzug, Uniform, Schürze, Weste, Latzhose,
      Trainingsanzug, Brautkleid, Kostüm, Sonnenbrille, Brille, Armbanduhr, Ring, Halskette, Ohrringe,
      Armband, Rucksack, Handtasche, Portemonnaie, Regenschirm, Krone, Helm, Dirndl, Lederhose, Poncho`),
    cat("music", "Musik & Kunst", `Gitarre, Klavier, Geige, Cello, Schlagzeug, Flöte, Trompete, Saxofon,
      Mundharmonika, Akkordeon, Harfe, Triangel, Xylofon, Dudelsack, Alphorn, Ukulele, Mikrofon, Kopfhörer,
      Lautsprecher, Konzert, Orchester, Chor, Band, Oper, Karaoke, Festival, Musikvideo, Schlaflied,
      Nationalhymne, Ballett, Breakdance, Gemälde, Skulptur, Zeichnung, Graffiti, Comic, Foto, Selfie,
      Statue, Mosaik, Töpfern, Origami, Pinsel, Wachsmalstift, Staffelei, Leinwand, Galerie, Gedicht, Roman,
      Märchen, Zaubertrick, Kasperlitheater, Zirkusnummer, Stand-up-Comedy, Film, Zeichentrickfilm, Podcast,
      Radio, Plattenspieler, Jodeln, Guggenmusik`),
    cat("leisure", "Freizeit & Hobbys", `Camping, Wandern, Fischen, Gärtnern, Kochen, Backen, Stricken, Nähen,
      Lesen, Schreiben, Malen, Fotografieren, Tanzen, Singen, Gamen, Jonglieren, Vogelbeobachtung,
      Sterne beobachten, Picknick, Grillieren, Sonnenbaden, Sightseeing, Roadtrip, Rucksackreise, Kreuzfahrt,
      Shopping, Spieleabend, Escape Room, Lagerfeuer, Pyjamaparty, Filmabend, Wellnesstag, Yogakurs, Joggen,
      Sandburg, Schneemann, Schneeballschlacht, Kissenschlacht, Wasserbomben, Schatzsuche, Kreuzworträtsel,
      Sudoku, Modelleisenbahn, Briefmarken sammeln, Lego, Videoanruf, Serienmarathon, Mittagsschlaf,
      Schaufensterbummel, Flohmarkt, Quizabend, Freizeitpark, Zoobesuch, Museumsbesuch, Weindegustation,
      Feuerwerk, Zaubershow, Freiwilligenarbeit, Pilze sammeln, Schlittschuhlaufen`),
    cat("geography", "Länder & Städte", `Schweiz, Deutschland, Österreich, Frankreich, Italien, Spanien, Portugal,
      England, Irland, Schottland, Island, Norwegen, Schweden, Finnland, Dänemark, Niederlande, Belgien,
      Griechenland, Türkei, Ägypten, Marokko, Südafrika, Kenia, Indien, China, Japan, Südkorea, Thailand,
      Australien, Neuseeland, Kanada, USA, Mexiko, Brasilien, Argentinien, Peru, Russland, Polen, Ungarn,
      Kroatien, Paris, London, Rom, Venedig, Berlin, Wien, Zürich, Genf, Bern, Basel, Luzern, New York,
      Las Vegas, Hollywood, Tokio, Dubai, Sydney, Rio de Janeiro, Antarktis, Nordpol, Sahara, Amazonas, Alpen,
      Matterhorn`),
    cat("school", "Schule & Büro", `Bleistift, Kugelschreiber, Radiergummi, Lineal, Spitzer, Schere, Leim, Heft,
      Schulsack, Taschenrechner, Wandtafel, Whiteboard, Kreide, Hausaufgaben, Prüfung, Zeugnis, Stundenplan,
      Pause, Turnstunde, Schulbus, Lehrerpult, Globus, Landkarte, Wörterbuch, Schulbuch, Laptop, Drucker,
      Bostitch, Büroklammer, Post-it, Ordner, Sitzung, Präsentation, Kaffeepause, Znünibox, Mensa, Deadline,
      E-Mail, Tabelle, Vorstellungsgespräch, Lohn, Ferien, Überstunden, Chef, Arbeitskollege, Praktikant,
      Bürostuhl, Schreibtischlampe, Namensschild, Visitenkarte, Videokonferenz, Diplom, Abschlussfeier,
      Schulreise, Klassenfoto, Nachsitzen, Elternabend, Lehrling, Homeoffice, Pausenbrot`),
    cat("holidays", "Feste & Feiertage", `Geburtstag, Weihnachten, Ostern, Halloween, Silvester, Valentinstag,
      Fasnacht, Hochzeit, Babyparty, Abschlussparty, Jahrestag, Beerdigung, Weihnachtsbaum, Adventskalender,
      Samichlaus, Christkind, Rentier, Osterei, Osterhase, Kürbis, Verkleidung, Maske, Feuerwerk, Champagner,
      Geburtstagstorte, Kerzen, Ballone, Konfetti, Partyhut, Piñata, Geschenk, Geschenkpapier, Glückwunschkarte,
      Blumenstrauss, Ehering, Flitterwochen, Polterabend, Überraschungsparty, Grillfest, Poolparty, Gartenfest,
      Karaokeabend, Tanzfläche, Buffet, Zuprosten, Gästeliste, Einladung, Partyspiele, Süsses oder Saures,
      Räbeliechtli, Laterne, Mistelzweig, Lebkuchen, Schoggiosterhase, Glühwein, Weihnachtsmarkt, Oktoberfest,
      Umzug, Bundesfeier, Countdown`),
    cat("fantasy", "Fantasie & Märchen", `Drache, Einhorn, Zauberer, Hexe, Fee, Elfe, Zwerg, Riese, Troll, Kobold,
      Gespenst, Vampir, Zombie, Werwolf, Mumie, Meerjungfrau, Pirat, Ritter, Prinzessin, Prinz, König, Königin,
      Schloss, Schatztruhe, Zauberstab, Kristallkugel, Fliegender Teppich, Zeitmaschine, Roboter, Ausserirdischer,
      UFO, Superheld, Bösewicht, Monster, Yeti, Ungeheuer von Loch Ness, Phönix, Flaschengeist, Wunderlampe,
      Zauberbuch, Zaubertrank, Spukhaus, Geheimgang, Tarnumhang, Schatzkarte, Dornröschen, Hexenhaus,
      Gläserner Schuh, Giftapfel, Zauberspiegel, Bohnenranke, Ninja, Samurai, Wikinger, Cowboy, Gladiator,
      Höhlenmensch, Dinosaurier, Verrückter Professor, Wahrsagerin, Rumpelstilzchen, Rotkäppchen`),
    cat("body", "Körper & Gesundheit", `Herz, Gehirn, Lunge, Magen, Knochen, Skelett, Schädel, Zahn, Zunge, Nase,
      Ohr, Auge, Augenbraue, Wimper, Haare, Bart, Schnurrbart, Hand, Finger, Daumen, Fingernagel, Ellbogen, Knie,
      Fuss, Zehe, Bauchnabel, Schulter, Hals, Rücken, Muskel, Blut, Niesen, Schluckauf, Gähnen, Husten, Fieber,
      Schnupfen, Kopfweh, Sonnenbrand, Sommersprossen, Tattoo, Pflaster, Verband, Krücken, Rollstuhl, Tablette,
      Spritze, Fiebermesser, Stethoskop, Röntgenbild, Operation, Zahnspange, Kontaktlinsen, Massage, Traum,
      Albtraum, Kitzeln, Gänsehaut, Muskelkater, Wadenkrampf`),
    cat("tech", "Technik & Werkzeug", `Smartphone, Laptop, Tablet, Tastatur, Computermaus, Bildschirm, Drucker,
      Kamera, Drohne, Smartwatch, Spielkonsole, Joystick, Virtual Reality, Ladegerät, Batterie, Powerbank,
      USB-Stick, Kabel, WLAN, Bluetooth, Passwort, App, Webseite, Emoji, Hashtag, Selfiestick, Staubsaugerroboter,
      Satellit, Teleskop, Mikroskop, Lupe, Kompass, Taschenlampe, Hammer, Nagel, Schraube, Schraubenzieher,
      Bohrmaschine, Säge, Schraubenschlüssel, Zange, Massband, Leiter, Schaufel, Rechen, Rasenmäher, Kettensäge,
      Werkzeugkasten, Klebeband, Heissleimpistole, Vorhängeschloss, Magnet, Glühbirne, Solaranlage, Windrad,
      Verlängerungskabel, Walkie-Talkie, Schreibmaschine, Faxgerät, Sackmesser`),
  ],
};

export const LANGS = { en: "English", de: "Deutsch" };

const key = (w) => w.toLocaleLowerCase();

// Categories of one language, with words that appear in an earlier category dropped,
// so every word belongs to exactly one category.
const cache = {};
export function categories(lang) {
  if (cache[lang]) return cache[lang];
  const seen = new Set();
  cache[lang] = (WORDS[lang] || []).map((c) => ({
    ...c,
    words: c.words.filter((w) => !seen.has(key(w)) && seen.add(key(w))),
  }));
  return cache[lang];
}

const usedSet = (used) => new Set((Array.isArray(used) ? used : []).filter((w) => typeof w === "string").map(key));

/** Every { word, cat, catId } of the chosen categories (all categories if none are chosen). */
export function pool(lang, catIds) {
  const cats = categories(lang);
  const chosen = cats.filter((c) => catIds.includes(c.id));
  return (chosen.length ? chosen : cats).flatMap((c) => c.words.map((word) => ({ word, cat: c.name, catId: c.id })));
}

/**
 * Picks a word nobody has had yet. `used` lists the words already played (any category).
 * When every word of the chosen categories was used, those words start over (reset: true).
 * Returns { word, cat, catId, used, reset } where `used` is the new list to remember.
 */
export function pickWord(lang, catIds, used, rand = Math.random) {
  const all = pool(lang, catIds);
  const seen = usedSet(used);
  let fresh = all.filter((e) => !seen.has(key(e.word)));
  let reset = false;
  if (!fresh.length) {
    for (const e of all) seen.delete(key(e.word));
    fresh = all;
    reset = true;
  }
  const pick = fresh[Math.floor(rand() * fresh.length)];
  seen.add(key(pick.word));
  return { ...pick, used: [...seen], reset };
}

/** How many words of the chosen categories are still unplayed. */
export function wordsLeft(lang, catIds, used) {
  const seen = usedSet(used);
  return pool(lang, catIds).filter((e) => !seen.has(key(e.word))).length;
}
