"""
╔══════════════════════════════════════════════════════════════╗
║ BOT DISCORD — PARIS SPORTIFS LIVE ║
║ Alertes live · Leaderboard · Alertes cotes · 100% Gratuit ║
╚══════════════════════════════════════════════════════════════╝
"""

import discord
from discord.ext import commands, tasks
from discord import app_commands
import aiohttp
import asyncio
import os
import json
from dotenv import load_dotenv
from datetime import datetime, timezone
load_dotenv()
# ─── CONFIG ────────────────────────────────────────────────────
DISCORD_TOKEN = os.getenv("DISCORD_TOKEN")
FOOTBALL_API_KEY = os.getenv("FOOTBALL_API_KEY")
ALERT_CHANNEL_ID = int(os.getenv("ALERT_CHANNEL_ID", "0"))
CHECK_INTERVAL = 60 # vérification toutes les 60 secondes
FOOTBALL_API_URL = "https://v3.football.api-sports.io"
HEADERS = {"x-apisports-key": FOOTBALL_API_KEY}
# Fichier de sauvegarde du leaderboard (persistant)
LEADERBOARD_FILE = "leaderboard.json"
# ─── COULEURS ──────────────────────────────────────────────────
COLOR_GOAL = 0x00FF88
COLOR_RED = 0xFF2222
COLOR_YELLOW = 0xFFCC00
COLOR_HALFTIME = 0x5865F2
COLOR_FULLTIME = 0xFFFFFF
COLOR_KICKOFF = 0xFF8800
COLOR_INFO = 0x2B2D31
COLOR_WIN = 0x00FF88
COLOR_LOSS = 0xFF4444
COLOR_COTE = 0xFFAA00
# ─── EMOJIS ────────────────────────────────────────────────────

E = {
"goal": " ", "red": " ", "yellow": " ",
"half": " ", "full": " ", "kick": " ",
"bet": " ", "win": " ", "loss": " ",
"live": " ", "clock": " ", "chart": " ",
"crown": " ", "fire": " ", "medal": " ",
}
# ─── BOT SETUP ─────────────────────────────────────────────────
intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix="!", intents=intents)
tree = bot.tree
# ─── ÉTAT GLOBAL ───────────────────────────────────────────────
paris_actifs: dict = {}
# Format :
# { fixture_id: {
# "home": str, "away": str,
# "paris": [ {user_id, pseudo, pari, cote} ],
# "last_events": set(),
# "status": str,
# "cotes_precedentes": { "home": float, "away": float, "draw": float }
# }}
alertes_cotes: dict = {}
# Format :
# { fixture_id: { "home": str, "away": str, "channel_id": int } }

# ══════════════════════════════════════════════════════════════
# LEADERBOARD (sauvegardé dans un fichier JSON)
# ══════════════════════════════════════════════════════════════
def charger_leaderboard() -> dict:
if os.path.exists(LEADERBOARD_FILE):
with open(LEADERBOARD_FILE, "r") as f:
return json.load(f)
return {}
def sauvegarder_leaderboard(lb: dict):
with open(LEADERBOARD_FILE, "w") as f:
json.dump(lb, f, indent=2)
def maj_leaderboard(user_id: int, pseudo: str, gagne: bool, cote: float = None):
lb = charger_leaderboard()
uid = str(user_id)

if uid not in lb:
lb[uid] = {"pseudo": pseudo, "paris": 0, "gagnes": 0, "perdus": 0, "points": 0}
lb[uid]["pseudo"] = pseudo
lb[uid]["paris"] += 1
if gagne:
lb[uid]["gagnes"] += 1
bonus = round((cote - 1) * 10) if cote else 10
lb[uid]["points"] += bonus
else:
lb[uid]["perdus"] += 1
lb[uid]["points"] = max(0, lb[uid]["points"] - 5)
sauvegarder_leaderboard(lb)

# ══════════════════════════════════════════════════════════════
# API FOOTBALL
# ══════════════════════════════════════════════════════════════
async def rechercher_match(equipe1: str, equipe2: str) -> list[dict]:
async with aiohttp.ClientSession() as session:
# Cherche en LIVE d'abord
async with session.get(
f"{FOOTBALL_API_URL}/fixtures",
headers=HEADERS, params={"live": "all"}
) as r:
data = await r.json()
res = filtrer(data.get("response", []), equipe1, equipe2)
if res:
return res
# Sinon matchs du jour
today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
async with session.get(
f"{FOOTBALL_API_URL}/fixtures",
headers=HEADERS, params={"date": today}
) as r:
data = await r.json()
return filtrer(data.get("response", []), equipe1, equipe2)
def filtrer(fixtures, e1, e2):
e1, e2 = e1.lower(), e2.lower()
return [
f for f in fixtures
if (e1 in f["teams"]["home"]["name"].lower() or e1 in f["teams"]["away"]["name"].lower())
and (e2 in f["teams"]["home"]["name"].lower() or e2 in f["teams"]["away"]["name"].lower())
]
async def get_fixture(fixture_id: int) -> dict | None:

async with aiohttp.ClientSession() as session:
async with session.get(
f"{FOOTBALL_API_URL}/fixtures",
headers=HEADERS, params={"id": fixture_id}
) as r:
data = await r.json()
if data.get("response"):
return data["response"][0]
return None
async def get_cotes(fixture_id: int) -> dict | None:
"""Récupère les cotes en direct pour un match."""
async with aiohttp.ClientSession() as session:
async with session.get(
f"{FOOTBALL_API_URL}/odds/live",
headers=HEADERS, params={"fixture": fixture_id}
) as r:
data = await r.json()
if not data.get("response"):
return None
# Cherche les cotes 1X2 (victoire domicile / nul / victoire extérieur)
for bookmaker in data["response"][0].get("bookmakers", []):
for bet in bookmaker.get("bets", []):
if bet["name"] == "Match Winner":
cotes = {}
for val in bet["values"]:
if val["value"] == "Home":
cotes["home"] = float(val["odd"])
elif val["value"] == "Draw":
cotes["draw"] = float(val["odd"])
elif val["value"] == "Away":
cotes["away"] = float(val["odd"])
return cotes
return None

# ══════════════════════════════════════════════════════════════
# EMBEDS
# ══════════════════════════════════════════════════════════════
def embed_but(fixture, event, mentions):
home = fixture["teams"]["home"]["name"]
away = fixture["teams"]["away"]["name"]
score_h = fixture["goals"]["home"] or 0
score_a = fixture["goals"]["away"] or 0
buteur = event.get("player", {}).get("name", "Inconnu")
equipe = event.get("team", {}).get("name", "?")

minute = event.get("time", {}).get("elapsed", "?")
assist = event.get("assist", {}).get("name")
embed = discord.Embed(
title=f"{E['goal']} BUT ! {home} {score_h} – {score_a} {away}",
description=f"**{buteur}** ({equipe}) — {minute}'",
color=COLOR_GOAL,
timestamp=datetime.now(timezone.utc)
)
if assist:
embed.add_field(name=" Passe décisive", value=assist, inline=True)
if mentions:
embed.add_field(name=f"{E['bet']} Parieurs", value=mentions, inline=False)
embed.set_footer(text=f"{E['live']} LIVE · {home} vs {away}")
return embed
def embed_carton(fixture, event, mentions):
home = fixture["teams"]["home"]["name"]
away = fixture["teams"]["away"]["name"]
joueur = event.get("player", {}).get("name", "Inconnu")
equipe = event.get("team", {}).get("name", "?")
minute = event.get("time", {}).get("elapsed", "?")
rouge = "Red" in event.get("detail", "")
embed = discord.Embed(
title=f"{' CARTON ROUGE' if rouge else ' Carton jaune'} — {joueur}",
description=f"**{equipe}** · {minute}'",
color=COLOR_RED if rouge else COLOR_YELLOW,
timestamp=datetime.now(timezone.utc)
)
if mentions:
embed.add_field(name=f"{E['bet']} Parieurs", value=mentions, inline=False)
embed.set_footer(text=f"{E['live']} LIVE · {home} vs {away}")
return embed
def embed_statut(fixture, statut, mentions):
home = fixture["teams"]["home"]["name"]
away = fixture["teams"]["away"]["name"]
score_h = fixture["goals"]["home"] or 0
score_a = fixture["goals"]["away"] or 0
if statut == "HT":
titre, couleur = f"{E['half']} MI-TEMPS · {home} {score_h} – {score_a} {away}", COLOR_HALFTIME
elif statut in ("FT","AET","PEN"):
titre, couleur = f"{E['full']} FIN DU MATCH · {home} {score_h} – {score_a} {away}", COLOR_FULLTIME
else:
titre, couleur = f"{E['kick']} COUP D'ENVOI · {home} vs {away}", COLOR_KICKOFF

embed = discord.Embed(title=titre, color=couleur, timestamp=datetime.now(timezone.utc))
if mentions:
embed.add_field(name=f"{E['bet']} Parieurs alertés", value=mentions, inline=False)
embed.set_footer(text=f"{E['live']} LIVE · {home} vs {away}")
return embed
def embed_alerte_cote(home, away, cotes_avant, cotes_apres):
embed = discord.Embed(
title=f"{E['chart']} MOUVEMENT DE COTES — {home} vs {away}",
color=COLOR_COTE,
timestamp=datetime.now(timezone.utc)
)
lignes = []
noms = {"home": f" {home}", "draw": " Nul", "away": f" {away}"}
for cle, label in noms.items():
avant = cotes_avant.get(cle, "?")
apres = cotes_apres.get(cle, "?")
if avant != "?" and apres != "?":
diff = apres - avant
fleche = " " if diff > 0 else " "
lignes.append(f"{label} : {avant:.2f} → **{apres:.2f}** {fleche} ({diff:+.2f})")
embed.description = "\n".join(lignes) if lignes else "Cotes mises à jour"
embed.set_footer(text="Données en direct · API-Football")
return embed

# ══════════════════════════════════════════════════════════════
# TÂCHE SURVEILLANCE LIVE
# ══════════════════════════════════════════════════════════════
@tasks.loop(seconds=CHECK_INTERVAL)
async def surveiller_matchs():
channel = bot.get_channel(ALERT_CHANNEL_ID)
if not channel:
return
for fixture_id, info in list(paris_actifs.items()):
fixture = await get_fixture(fixture_id)
if not fixture:
continue
statut = fixture["fixture"]["status"]["short"]
events = fixture.get("events", [])
mentions = " ".join(f"<@{p['user_id']}>" for p in info["paris"])
# ── Coup d'envoi

if statut == "1H" and info["status"] == "NS":
info["status"] = "1H"
await channel.send(embed=embed_statut(fixture, statut, mentions))
# ── Mi-temps
if statut == "HT" and info["status"] != "HT":
info["status"] = "HT"
await channel.send(embed=embed_statut(fixture, "HT", mentions))
# ── Fin du match
if statut in ("FT","AET","PEN") and info["status"] not in ("FT","AET","PEN"):
info["status"] = statut
await channel.send(embed=embed_statut(fixture, statut, mentions))
await asyncio.sleep(2)
# Résumé de chaque pari
home = fixture["teams"]["home"]["name"]
away = fixture["teams"]["away"]["name"]
score_h = fixture["goals"]["home"] or 0
score_a = fixture["goals"]["away"] or 0
gagnant = home if score_h > score_a else (away if score_a > score_h else "nul")
for p in info["paris"]:
pari_txt = p["pari"].lower()
gagne = (
pari_txt in gagnant.lower()
or ("nul" in pari_txt and gagnant == "nul")
or ("draw" in pari_txt and gagnant == "nul")
)
maj_leaderboard(p["user_id"], p["pseudo"], gagne, p.get("cote"))
embed = discord.Embed(
title=f"{' PARI GAGNANT !' if gagne else ' Pari perdu'}",
description=f"<@{p['user_id']}> avait misé sur : **{p['pari']}**",
color=COLOR_WIN if gagne else COLOR_LOSS,
timestamp=datetime.now(timezone.utc)
)
embed.add_field(
name="Score final",
value=f"{home} **{score_h} – {score_a}** {away}",
inline=False
)
if p.get("cote"):
embed.add_field(name="Cote", value=f"x{p['cote']}", inline=True)
await channel.send(embed=embed)
await asyncio.sleep(300)

paris_actifs.pop(fixture_id, None)
continue
# ── Buts et cartons
for event in events:
key = (
event.get("time", {}).get("elapsed"),
event.get("type"),
event.get("player", {}).get("name"),
)
if key in info["last_events"]:
continue
info["last_events"].add(key)
etype = event.get("type", "")
if etype == "Goal":
await channel.send(embed=embed_but(fixture, event, mentions))
elif etype == "Card":
detail = event.get("detail", "")
if "Red" in detail or "Yellow" in detail:
await channel.send(embed=embed_carton(fixture, event, mentions))
# ── Alertes cotes (si activées pour ce match)
if fixture_id in alertes_cotes:
cotes = await get_cotes(fixture_id)
if cotes:
precedentes = info.get("cotes_precedentes", {})
if precedentes:
# Vérifie si une cote a bougé de plus de 0.15
for cle in ("home", "draw", "away"):
avant = precedentes.get(cle, 0)
apres = cotes.get(cle, 0)
if avant and apres and abs(apres - avant) >= 0.15:
home_n = info["home"]
away_n = info["away"]
await channel.send(
embed=embed_alerte_cote(home_n, away_n, precedentes, cotes)
)
break
info["cotes_precedentes"] = cotes

# ══════════════════════════════════════════════════════════════
# COMMANDES SLASH
# ══════════════════════════════════════════════════════════════
# ── /suivre ── Suivre un match SANS pari (juste les alertes live)

@tree.command(name="suivre", description=" Suivre un match en live sans pari")
@app_commands.describe(
equipe1="Première équipe (ex: Brazil)",
equipe2="Deuxième équipe (ex: France)",
)
async def cmd_suivre(interaction: discord.Interaction, equipe1: str, equipe2: str):
await interaction.response.defer()
matchs = await rechercher_match(equipe1, equipe2)
if not matchs:
await interaction.followup.send(
f" Aucun match trouvé entre **{equipe1}** et **{equipe2}** aujourd'hui.\n"
" Écris les noms en anglais (ex: Brazil, France, Real Madrid...)"
)
return
fixture = matchs[0]
fixture_id = fixture["fixture"]["id"]
home = fixture["teams"]["home"]["name"]
away = fixture["teams"]["away"]["name"]
statut = fixture["fixture"]["status"]["long"]
if fixture_id not in paris_actifs:
paris_actifs[fixture_id] = {
"home": home, "away": away,
"paris": [], "last_events": set(),
"status": fixture["fixture"]["status"]["short"],
"cotes_precedentes": {},
}
embed = discord.Embed(
title=f"{E['live']} Surveillance activée !",
description=f"**{home}** vs **{away}**",
color=COLOR_KICKOFF,
timestamp=datetime.now(timezone.utc)
)
embed.add_field(name=" Statut", value=statut, inline=True)
embed.add_field(
name=" Alertes",
value="Buts · Cartons · Mi-temps · Fin de match",
inline=False
)
embed.add_field(
name=" Salon",
value=f"<#{ALERT_CHANNEL_ID}>",
inline=True
)
await interaction.followup.send(embed=embed)

# ── /pari ── Enregistrer un pari
@tree.command(name="pari", description=" Enregistrer un pari sur un match")
@app_commands.describe(
equipe1="Première équipe (ex: Brazil)",
equipe2="Deuxième équipe (ex: France)",
pari="Ton pari (ex: France gagne, Match nul, +2.5 buts...)",
cote="Cote de ton pari chez ton bookmaker (ex: 2.5)",
)
async def cmd_pari(
interaction: discord.Interaction,
equipe1: str, equipe2: str, pari: str, cote: float = None
):
await interaction.response.defer()
matchs = await rechercher_match(equipe1, equipe2)
if not matchs:
await interaction.followup.send(
f" Aucun match trouvé entre **{equipe1}** et **{equipe2}** aujourd'hui.\n"
" Écris les noms en anglais (ex: Brazil, France, Real Madrid...)"
)
return
fixture = matchs[0]
fixture_id = fixture["fixture"]["id"]
home = fixture["teams"]["home"]["name"]
away = fixture["teams"]["away"]["name"]
statut = fixture["fixture"]["status"]["long"]
if fixture_id not in paris_actifs:
paris_actifs[fixture_id] = {
"home": home, "away": away,
"paris": [], "last_events": set(),
"status": fixture["fixture"]["status"]["short"],
"cotes_precedentes": {},
}
paris_actifs[fixture_id]["paris"].append({
"user_id": interaction.user.id,
"pseudo": interaction.user.display_name,
"pari": pari,
"cote": cote,
})
embed = discord.Embed(
title=f"{E['bet']} Pari enregistré !",
description=f"**{home}** vs **{away}**",

color=COLOR_INFO,
timestamp=datetime.now(timezone.utc)
)
embed.add_field(name=" Ton pari", value=pari, inline=True)
embed.add_field(name=" Cote", value=f"x{cote}" if cote else "Non renseignée", inline=True)
embed.add_field(name=" Statut", value=statut, inline=True)
embed.add_field(
name=f"{E['live']} Alertes",
value=f"Tu seras alerté dans <#{ALERT_CHANNEL_ID}> à chaque événement",
inline=False
)
embed.set_footer(text=f"Parieur : {interaction.user.display_name}")
await interaction.followup.send(embed=embed)

# ── /cotes ── Activer les alertes de cotes pour un match
@tree.command(name="cotes", description=" Activer les alertes de mouvement de cotes")
@app_commands.describe(
equipe1="Première équipe (ex: Brazil)",
equipe2="Deuxième équipe (ex: France)",
)
async def cmd_cotes(interaction: discord.Interaction, equipe1: str, equipe2: str):
await interaction.response.defer()
matchs = await rechercher_match(equipe1, equipe2)
if not matchs:
await interaction.followup.send(
f" Aucun match trouvé entre **{equipe1}** et **{equipe2}**."
)
return
fixture = matchs[0]
fixture_id = fixture["fixture"]["id"]
home = fixture["teams"]["home"]["name"]
away = fixture["teams"]["away"]["name"]
alertes_cotes[fixture_id] = {
"home": home, "away": away,
"channel_id": ALERT_CHANNEL_ID
}
# S'assure que le match est aussi dans paris_actifs pour la surveillance
if fixture_id not in paris_actifs:
paris_actifs[fixture_id] = {
"home": home, "away": away,
"paris": [], "last_events": set(),
"status": fixture["fixture"]["status"]["short"],
"cotes_precedentes": {},

}
embed = discord.Embed(
title=f"{E['chart']} Alertes cotes activées !",
description=f"**{home}** vs **{away}**",
color=COLOR_COTE,
timestamp=datetime.now(timezone.utc)
)
embed.add_field(
name=" Déclenchement",
value="Alerte si une cote bouge de ±0.15 ou plus",
inline=False
)
embed.add_field(name=" Salon", value=f"<#{ALERT_CHANNEL_ID}>", inline=True)
await interaction.followup.send(embed=embed)

# ── /classement ── Leaderboard des parieurs
@tree.command(name="classement", description=" Voir le classement des meilleurs parieurs")
async def cmd_classement(interaction: discord.Interaction):
lb = charger_leaderboard()
if not lb:
await interaction.response.send_message(
"Aucun pari enregistré pour l'instant. Commence avec `/pari` !", ephemeral=True
)
return
# Trie par points
tries = sorted(lb.values(), key=lambda x: x["points"], reverse=True)
embed = discord.Embed(
title=f"{E['crown']} Classement des Parieurs",
color=COLOR_WIN,
timestamp=datetime.now(timezone.utc)
)
medailles = [" ", " ", " "]
lignes = []
for i, joueur in enumerate(tries[:10]):
medaille = medailles[i] if i < 3 else f"#{i+1}"
taux = round(joueur["gagnes"] / joueur["paris"] * 100) if joueur["paris"] > 0 else 0
lignes.append(
f"{medaille} **{joueur['pseudo']}** — "
f"{joueur['points']} pts · "
f"{joueur['gagnes']}W/{joueur['perdus']}L ({taux}%)"
)

embed.description = "\n".join(lignes)
embed.set_footer(text="Points : +10×(cote-1) par victoire · -5 par défaite")
await interaction.response.send_message(embed=embed)

# ── /matchs ── Matchs en surveillance
@tree.command(name="matchs", description=" Voir les matchs actuellement surveillés")
async def cmd_matchs(interaction: discord.Interaction):
if not paris_actifs:
await interaction.response.send_message(
"Aucun match en surveillance. Utilise `/suivre` ou `/pari` !", ephemeral=True
)
return
embed = discord.Embed(
title=f"{E['live']} Matchs surveillés",
color=COLOR_INFO,
timestamp=datetime.now(timezone.utc)
)
for fid, info in paris_actifs.items():
parieurs = ", ".join(f"<@{p['user_id']}>" for p in info["paris"]) or "Aucun parieur"
paris_list = "\n".join(
f"• {p['pari']}" + (f" (x{p['cote']})" if p.get("cote") else "")
for p in info["paris"]
) or "Surveillance sans pari"
embed.add_field(
name=f" {info['home']} vs {info['away']}",
value=f"**Parieurs :** {parieurs}\n{paris_list}",
inline=False
)
await interaction.response.send_message(embed=embed)

# ── /stop ── Arrêter la surveillance
@tree.command(name="stop", description=" Arrêter la surveillance d'un match")
@app_commands.describe(equipe="Nom d'une équipe du match à stopper")
async def cmd_stop(interaction: discord.Interaction, equipe: str):
retires = [
fid for fid, info in paris_actifs.items()
if equipe.lower() in info["home"].lower() or equipe.lower() in info["away"].lower()
]
if not retires:
await interaction.response.send_message(
f" Aucun match avec **{equipe}** en surveillance.", ephemeral=True
)
return
for fid in retires:

paris_actifs.pop(fid, None)
alertes_cotes.pop(fid, None)
await interaction.response.send_message(
f" Surveillance arrêtée pour {len(retires)} match(s) liés à **{equipe}**.",
ephemeral=True
)

# ── /aide ── Aide complète
@tree.command(name="aide", description=" Aide du bot paris sportifs")
async def cmd_aide(interaction: discord.Interaction):
embed = discord.Embed(
title=" Bot Paris Sportifs — Toutes les commandes",
color=COLOR_INFO,
)
commandes = [
("/suivre [equipe1] [equipe2]", "Suivre un match en live (alertes buts, cartons, etc.)"),
("/pari [equipe1] [equipe2] [pari] [cote]", "Enregistrer un pari + alertes live"),
("/cotes [equipe1] [equipe2]", "Activer les alertes si les cotes bougent beaucoup"),
("/classement", "Voir le top 10 des meilleurs parieurs"),
("/matchs", "Voir les matchs actuellement surveillés"),
("/stop [equipe]", "Arrêter la surveillance d'un match"),
]
for cmd, desc in commandes:
embed.add_field(name=cmd, value=desc, inline=False)
embed.add_field(
name=" Alertes automatiques",
value=" Buts · Cartons · Mi-temps · Fin de match · Cotes",
inline=False
)
embed.set_footer(text="Données : API-Football · Mise à jour toutes les 60s")
await interaction.response.send_message(embed=embed)

# ══════════════════════════════════════════════════════════════
# DÉMARRAGE
# ══════════════════════════════════════════════════════════════
@bot.event
async def on_ready():
print(f" Bot connecté : {bot.user}")
await tree.sync()
print(" Commandes slash synchronisées")
surveiller_matchs.start()
print(f" Surveillance démarrée (toutes les {CHECK_INTERVAL}s)")
if __name__ == "__main__":

if not DISCORD_TOKEN:
print(" DISCORD_TOKEN manquant dans .env")
elif not FOOTBALL_API_KEY:
print(" FOOTBALL_API_KEY manquant dans .env")
else:
bot.run(DISCORD_TOKEN)
