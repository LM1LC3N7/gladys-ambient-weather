# Ambient Weather

**Connecteur non officiel, sans lien avec Ambient Weather.** Il amène dans
Gladys les capteurs de vos stations [Ambient Weather](https://ambientweather.net),
lus par l'API officielle d'Ambient Weather (REST et temps réel). En option, il
propose aussi les **stations publiques de l'Ambient Weather Network** autour
de vos maisons, sans aucun compte.

## Ce que vous obtenez

| Appareil dans Gladys      | Capteurs                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Station** (extérieur)   | température, humidité, pression relative et absolue, vitesse du vent, rafale, rafale maximale du jour, direction du vent (et leurs moyennes sur 10 minutes), intensité de pluie, pluie de l'épisode / du jour / sur 24 h / de la semaine / du mois / de l'année / totale, indice UV, rayonnement solaire, pile faible du capteur extérieur et du pluviomètre |
| **Station – indoor**      | température et humidité intérieures, pile faible de la console                                                                                                                                                                                                                                                                                               |
| **Station – sensor 1…10** | température et humidité de chaque capteur supplémentaire, pile faible                                                                                                                                                                                                                                                                                        |
| **Station – soil 1…10**   | humidité et température du sol de chaque sonde de sol, pile faible                                                                                                                                                                                                                                                                                           |
| **Station publique**      | la météo extérieure d'une station publique proche (ni pile, ni valeur intérieure)                                                                                                                                                                                                                                                                            |

Une station ne reçoit que les capteurs qu'elle transmet : rien n'est créé
pour un capteur que vous n'avez pas. Chaque groupe est un appareil à part :
la console intérieure et le capteur extérieur peuvent aller dans des pièces
différentes. Le rayonnement solaire est affiché en lux (W/m² ÷ 0,0079,
l'approximation habituelle de la lumière du jour) : Gladys n'a pas d'unité
W/m². Les noms des appareils et des capteurs sont en anglais ; renommez-les à
la création si vous le souhaitez.

## Installation

1. Sur [ambientweather.net](https://ambientweather.net/account/keys), ouvrez
   **Account → API Keys** et créez :
   - une **clé d'API** (« API Key », la clé de votre compte),
   - une **clé d'application** (« Application Key », la clé développeur ;
     une courte description comme « Gladys » suffit).
2. Installez l'intégration depuis le catalogue de Gladys (Gladys 5.1 ou plus
   récent) et acceptez l'accès à la **position de vos maisons** (utilisée
   uniquement pour les stations publiques, et seulement si vous les activez).
3. Dans l'écran **Configuration**, collez les deux clés et enregistrez.
4. Cliquez sur **Tester Ambient Weather** : le message liste vos stations et
   leur dernière mesure.
5. Ouvrez l'onglet **Découverte** et ajoutez les appareils voulus. Leurs
   valeurs arrivent dès leur création.

Uniquement les stations publiques ? Laissez les deux clés vides et activez
**Stations publiques à proximité**.

## Configuration

- **Clé d'API**, **clé d'application** : toutes deux nécessaires pour les
  stations de votre compte. Elles sont stockées comme secrets et jamais
  écrites dans les journaux.
- **Unités** (métrique par défaut) : seules les températures changent, °C
  (métrique) ou °F (impérial). Le vent est toujours en km/h, les cumuls de
  pluie en mm, l'intensité en mm/h, la pluie des dernières 24 heures en mm
  par jour et la pression en hPa : Gladys n'a ni inHg ni in/h, l'impérial se
  limite donc aux °F. Un appareil garde l'unité de sa création : après un
  changement, ses valeurs restent envoyées dans cette unité ; supprimez-le
  et recréez-le pour la changer.
- **Intervalle de lecture du compte** (5 minutes par défaut, de 1 à 60) : une
  requête à l'API à chaque fois.
- **Mises à jour en temps réel** (activées par défaut) : une connexion à
  l'API temps réel d'Ambient Weather, pour que chaque nouvelle mesure arrive
  dès que la station l'envoie, entre deux lectures.
- **Stations publiques à proximité** (désactivées par défaut), **rayon de
  recherche** (10 km), **stations publiques proposées par maison** (3) et leur
  **intervalle de lecture** (10 minutes, 5 au minimum).

## À quelle fréquence Ambient Weather est appelé

- L'API autorise **1 requête par seconde par clé d'API** (et 3 par seconde
  par clé d'application), et répond « 429 » au-delà. L'intégration n'envoie
  jamais deux requêtes à moins de 1,1 s d'intervalle, quelle qu'en soit
  l'origine (lecture périodique, onglet Découverte, bouton de test).
- Le compte : une requête à chaque « intervalle de lecture du compte », plus
  une au démarrage et à chaque test. Clés refusées : un essai toutes les 30
  minutes jusqu'à ce que vous changiez la configuration. Un « 429 » : la
  lecture suivante attend le délai demandé par Ambient (Retry-After), une
  minute sinon.
- Le temps réel : une connexion, gardée ouverte, rétablie après 5 s environ,
  puis 10 s, 20 s… jusqu'à 5 minutes (±20 % au hasard) ; le délai revient à
  5 s une fois qu'un lien a tenu une minute. Une poignée de main doit aboutir
  en 30 s ; après trois échecs, l'autre version du protocole (Engine.IO v3 ou
  v4) est essayée.
- Les stations publiques : une requête par maison localisée à chaque
  « intervalle de lecture » (100 stations au plus), plus une par station
  publique créée que la recherche n'a pas renvoyée, une à la fois.

Seules les valeurs qui changent sont envoyées à Gladys (plus chaque valeur
inchangée toutes les 30 minutes), et jamais plus de 250 par minute (le reste
suit une minute plus tard), sous les 300 états par minute qu'accepte Gladys.
Une mesure de plus d'une heure (station hors ligne) n'est pas envoyée.

## Stations publiques

Les stations publiques sont celles que leurs propriétaires ont choisi de
partager sur la carte de l'Ambient Weather Network. Elles sont cherchées dans
un carré autour de chaque maison localisée (Paramètres → Maisons), puis
filtrées : dans le rayon, en extérieur, une mesure de moins d'une heure, une
température, aucune de vos propres stations. Les plus proches sont proposées
dans l'onglet Découverte ; celles que vous créez gardent leurs valeurs, lues
par leur adresse quand la recherche ne les renvoie plus.

Le service de la carte publique **n'est pas une API documentée** : Ambient
Weather peut le modifier sans préavis. C'est celui qu'utilise la carte
d'ambientweather.net, et celui que lisent aioambient et l'intégration
« Ambient Weather Network » de Home Assistant.

## Dépannage

- **« Ambient Weather a refusé les clés »** : vérifiez les deux clés sur la
  page API Keys (une clé d'application n'est pas une clé d'API).
- **« Ambient Weather demande de ralentir (429) »** : un autre outil utilise
  la même clé d'API au même moment ; la lecture suivante réessaie d'elle-même.
- **Un appareil n'a pas de valeur** : la station n'a rien envoyé depuis plus
  d'une heure, ou l'API ne transmet pas ce capteur.
- **Aucune station publique** : la maison doit avoir une position dans
  Gladys, et le réseau est clairsemé hors d'Amérique du Nord : essayez un
  rayon plus grand.
- Journaux : le niveau se règle avec la variable `LOG_LEVEL`.

## Vie privée

Stations publiques désactivées (par défaut), aucune position ne quitte
Gladys. Activées, les coordonnées de chaque maison, arrondies à 2 décimales
(1 km environ), sont envoyées à Ambient Weather comme zone de recherche. Les
clés ne partent que vers Ambient Weather, en HTTPS.

## Crédits

Construit d'après la
[documentation officielle de l'API Ambient Weather](https://ambientweather.docs.apiary.io/)
et [aioambient](https://github.com/bachya/aioambient) (MIT, Aaron Bach), le
client Python qu'utilise Home Assistant : points d'accès, noms des champs,
limites de débit, protocole temps réel, stations publiques. Ambient Weather
est une marque de son propriétaire ; ce connecteur est gratuit et non
officiel.
