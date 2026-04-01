
# Bot Discord Paris Sportifs Live - Version 7
# Base de donnees SQLite permanente + VIP monetisation + salons dedies

import discord
from discord.ext import commands, tasks
from discord import app_commands
import aiohttp
import asyncio
import os
import sqlite3
import json
from dotenv import load_dotenv
from datetime import datetime, timezone, timedelta

load_dotenv()

# ─── CONFIG ────────────────────────────────────────────────────
DISCORD_TOKEN    = os.getenv("DISCORD_TOKEN")
FOOTBALL_API_KEY = os.getenv("FOOTBALL_API_KEY")
ALERT_CHANNEL_ID = int(os.getenv("ALERT_CHANNEL_ID", "0"))
CHECK_INTERVAL   = 60

FOOTBALL_API_URL = "https://v3.football.api-sports.io"
HEADERS          = {"x-apisports-key": FOOTBALL_API_KEY}

# ─── ROLES ─────────────────────────────────────────────────────
ROLE_ADMIN = "bookmaker💹"
ROLE_VIP   = "vip"

# ─── COULEURS ──────────────────────────────────────────────────
COLOR_GOAL     = 0x00FF88
COLOR_RED      = 0xFF2222
COLOR_YELLOW   = 0xFFCC00
COLOR_HALFTIME = 0x5865F2
COLOR_FULLTIME = 0xFFFFFF
COLOR_KICKOFF  = 0xFF8800
COLOR_INFO     = 0x2B2D31
COLOR_WIN      = 0x00FF88
COLOR_LOSS     = 0xFF4444
COLOR_COTE     = 0xFFAA00
COLOR_VIP      = 0xFFD700

# ─── EMOJIS ────────────────────────────────────────────────────
E = {
    "goal":  "⚽", "red":    "🟥", "yellow": "🟨",
    "half":  "🔔", "full":   "🏁", "kick":   "🚀",
    "bet":   "🎰", "win":    "🏆", "loss":   "💸",
    "live":  "🔴", "clock":  "⏱️", "chart":  "📈",
    "crown": "👑", "fire":   "🔥", "vip":    "💎",
    "lock":  "🔒", "wave":   "👋",
}

# ─── BOT SETUP ─────────────────────────────────────────────────
intents = discord.Intents.default()
intents.message_content = True
intents.members         = True
bot  = commands.Bot(command_prefix="!", intents=intents)
tree = bot.tree

# ─── ETAT GLOBAL ───────────────────────────────────────────────
paris_actifs:      dict = {}
alertes_cotes:     dict = {}
challenge_semaine: dict = {}
blessures_alertees: set = set()
invites_cache: dict = {}  # { code: { uses, inviter_id, inviter_pseudo } }


# ══════════════════════════════════════════════════════════════
#  BASE DE DONNEES SQLite (permanente)
# ══════════════════════════════════════════════════════════════

DB_FILE = "bot_paris.db"

def init_db():
    con = sqlite3.connect(DB_FILE)
    cur = con.cursor()
    cur.executescript("""
        CREATE TABLE IF NOT EXISTS leaderboard (
            user_id  TEXT PRIMARY KEY,
            pseudo   TEXT,
            paris    INTEGER DEFAULT 0,
            gagnes   INTEGER DEFAULT 0,
            perdus   INTEGER DEFAULT 0,
            points   INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS duels (
            duel_id          TEXT PRIMARY KEY,
            challenger_id    TEXT,
            challenger_pseudo TEXT,
            adversaire_id    TEXT,
            adversaire_pseudo TEXT,
            match            TEXT,
            pari_challenger  TEXT,
            pari_adversaire  TEXT,
            statut           TEXT DEFAULT 'en_attente',
            date_creation    TEXT
        );
        CREATE TABLE IF NOT EXISTS classement_duels (
            user_id  TEXT PRIMARY KEY,
            pseudo   TEXT,
            gagnes   INTEGER DEFAULT 0,
            perdus   INTEGER DEFAULT 0,
            serie    INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS historique_duels (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     TEXT,
            adversaire  TEXT,
            match       TEXT,
            pari        TEXT,
            resultat    TEXT,
            date        TEXT
        );
        CREATE TABLE IF NOT EXISTS bankrolls (
            user_id  TEXT PRIMARY KEY,
            pseudo   TEXT,
            solde    REAL,
            initial  REAL
        );
        CREATE TABLE IF NOT EXISTS bankroll_historique (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id  TEXT,
            montant  REAL,
            resultat TEXT,
            solde    REAL,
            date     TEXT
        );
        CREATE TABLE IF NOT EXISTS roue_fortune (
            user_id       TEXT PRIMARY KEY,
            pseudo        TEXT,
            derniere_roue TEXT
        );
        CREATE TABLE IF NOT EXISTS parrainage (
            user_id     TEXT PRIMARY KEY,
            pseudo      TEXT,
            parrainages INTEGER DEFAULT 0,
            points      INTEGER DEFAULT 0
        );
    """)

    con.commit()
    con.close()

def db():
    return sqlite3.connect(DB_FILE)


# ══════════════════════════════════════════════════════════════
#  HELPERS ROLES
# ══════════════════════════════════════════════════════════════

def check_admin(interaction: discord.Interaction) -> bool:
    return any(r.name == ROLE_ADMIN for r in interaction.user.roles)

def check_vip(interaction: discord.Interaction) -> bool:
    roles = [r.name.lower() for r in interaction.user.roles]
    return any(ROLE_VIP in r or "patreon" in r or ROLE_ADMIN in r for r in roles) or check_admin(interaction)

async def refus_admin(interaction: discord.Interaction):
    embed = discord.Embed(
        title="❌ Accès refusé",
        description=f"Cette commande est réservée au rôle **{ROLE_ADMIN}**.",
        color=COLOR_LOSS
    )
    await interaction.response.send_message(embed=embed, ephemeral=True)

async def refus_vip(interaction: discord.Interaction):
    embed = discord.Embed(
        title=f"{E['lock']} Fonctionnalité VIP",
        description=(
            "Cette commande est réservée aux membres **VIP Patreon**.\n\n"
            "Accède à toutes les fonctions premium :\n"
            f"{E['chart']} Comparaison des cotes en direct\n"
            f"{E['chart']} Alertes mouvements de cotes\n"
            f"📊 Statistiques avancées des équipes\n"
            f"📈 Calcul value bet + mise Kelly\n"
            f"💰 Gestion de bankroll complète\n\n"
            "👉 **Abonne-toi sur Patreon pour débloquer tout ça !**"
        ),
        color=COLOR_VIP
    )
    await interaction.response.send_message(embed=embed, ephemeral=True)


# ══════════════════════════════════════════════════════════════
#  LEADERBOARD DB
# ══════════════════════════════════════════════════════════════

def maj_leaderboard(user_id: int, pseudo: str, gagne: bool, cote: float = None):
    con = db()
    cur = con.cursor()
    cur.execute("INSERT OR IGNORE INTO leaderboard (user_id, pseudo) VALUES (?, ?)", (str(user_id), pseudo))
    cur.execute("UPDATE leaderboard SET pseudo=? WHERE user_id=?", (pseudo, str(user_id)))
    cur.execute("UPDATE leaderboard SET paris = paris + 1 WHERE user_id=?", (str(user_id),))
    if gagne:
        bonus = round((cote - 1) * 10) if cote else 10
        cur.execute("UPDATE leaderboard SET gagnes = gagnes + 1, points = points + ? WHERE user_id=?", (bonus, str(user_id)))
    else:
        cur.execute("UPDATE leaderboard SET perdus = perdus + 1, points = MAX(0, points - 5) WHERE user_id=?", (str(user_id),))
    con.commit()
    con.close()


# ══════════════════════════════════════════════════════════════
#  API FOOTBALL
# ══════════════════════════════════════════════════════════════

async def rechercher_match(equipe1: str, equipe2: str) -> list[dict]:
    async with aiohttp.ClientSession() as session:
        async with session.get(f"{FOOTBALL_API_URL}/fixtures", headers=HEADERS, params={"live": "all"}) as r:
            data = await r.json()
            res  = filtrer(data.get("response", []), equipe1, equipe2)
            if res:
                return res
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        async with session.get(f"{FOOTBALL_API_URL}/fixtures", headers=HEADERS, params={"date": today}) as r:
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
        async with session.get(f"{FOOTBALL_API_URL}/fixtures", headers=HEADERS, params={"id": fixture_id}) as r:
            data = await r.json()
            if data.get("response"):
                return data["response"][0]
    return None


# ══════════════════════════════════════════════════════════════
#  EMBEDS
# ══════════════════════════════════════════════════════════════

def embed_but(fixture, event, mentions):
    home    = fixture["teams"]["home"]["name"]
    away    = fixture["teams"]["away"]["name"]
    score_h = fixture["goals"]["home"] or 0
    score_a = fixture["goals"]["away"] or 0
    buteur  = event.get("player", {}).get("name", "Inconnu")
    equipe  = event.get("team", {}).get("name", "?")
    minute  = event.get("time", {}).get("elapsed", "?")
    assist  = event.get("assist", {}).get("name")
    embed = discord.Embed(
        title=f"{E['goal']} BUT !  {home} {score_h} - {score_a} {away}",
        description=f"**{buteur}** ({equipe}) - {minute}'",
        color=COLOR_GOAL, timestamp=datetime.now(timezone.utc)
    )
    if assist:
        embed.add_field(name="Passe decisive", value=assist, inline=True)
    if mentions:
        embed.add_field(name=f"{E['bet']} Parieurs", value=mentions, inline=False)
    embed.set_footer(text=f"{E['live']} LIVE - {home} vs {away}")
    return embed

def embed_carton(fixture, event, mentions):
    home   = fixture["teams"]["home"]["name"]
    away   = fixture["teams"]["away"]["name"]
    joueur = event.get("player", {}).get("name", "Inconnu")
    equipe = event.get("team", {}).get("name", "?")
    minute = event.get("time", {}).get("elapsed", "?")
    rouge  = "Red" in event.get("detail", "")
    embed = discord.Embed(
        title=f"{'🟥 CARTON ROUGE' if rouge else '🟨 Carton jaune'} - {joueur}",
        description=f"**{equipe}** - {minute}'",
        color=COLOR_RED if rouge else COLOR_YELLOW,
        timestamp=datetime.now(timezone.utc)
    )
    if mentions:
        embed.add_field(name=f"{E['bet']} Parieurs", value=mentions, inline=False)
    embed.set_footer(text=f"{E['live']} LIVE - {home} vs {away}")
    return embed

def embed_statut(fixture, statut, mentions):
    home    = fixture["teams"]["home"]["name"]
    away    = fixture["teams"]["away"]["name"]
    score_h = fixture["goals"]["home"] or 0
    score_a = fixture["goals"]["away"] or 0
    if statut == "HT":
        titre, couleur = f"{E['half']} MI-TEMPS - {home} {score_h} - {score_a} {away}", COLOR_HALFTIME
    elif statut in ("FT", "AET", "PEN"):
        titre, couleur = f"{E['full']} FIN DU MATCH - {home} {score_h} - {score_a} {away}", COLOR_FULLTIME
    else:
        titre, couleur = f"{E['kick']} COUP D ENVOI - {home} vs {away}", COLOR_KICKOFF
    embed = discord.Embed(title=titre, color=couleur, timestamp=datetime.now(timezone.utc))
    if mentions:
        embed.add_field(name=f"{E['bet']} Parieurs alertes", value=mentions, inline=False)
    embed.set_footer(text=f"{E['live']} LIVE - {home} vs {away}")
    return embed


# ══════════════════════════════════════════════════════════════
#  SURVEILLANCE LIVE
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
        statut   = fixture["fixture"]["status"]["short"]
        events   = fixture.get("events", [])
        mentions = " ".join(f"<@{p['user_id']}>" for p in info["paris"])

        if statut in ("1H", "2H") and info["status"] == "NS":
            info["status"] = statut
            await channel.send(embed=embed_statut(fixture, statut, mentions))

        if statut == "2H" and info["status"] == "HT":
            info["status"] = "2H"

        if statut == "HT" and info["status"] not in ("HT", "2H", "FT", "AET", "PEN"):
            info["status"] = "HT"
            await channel.send(embed=embed_statut(fixture, "HT", mentions))

        STATUTS_FIN = ("FT", "AET", "PEN", "AWD", "WO")
        if statut in STATUTS_FIN and info["status"] not in STATUTS_FIN:
            info["status"] = statut
            await channel.send(embed=embed_statut(fixture, statut, mentions))
            await asyncio.sleep(2)

            home    = fixture["teams"]["home"]["name"]
            away    = fixture["teams"]["away"]["name"]
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
                    title=f"{'🏆 PARI GAGNANT !' if gagne else '💸 Pari perdu'}",
                    description=f"<@{p['user_id']}> avait mise sur : **{p['pari']}**",
                    color=COLOR_WIN if gagne else COLOR_LOSS,
                    timestamp=datetime.now(timezone.utc)
                )
                embed.add_field(name="Score final", value=f"{home} **{score_h} - {score_a}** {away}", inline=False)
                if p.get("cote"):
                    embed.add_field(name="Cote", value=f"x{p['cote']}", inline=True)
                await channel.send(embed=embed)

            await asyncio.sleep(300)
            paris_actifs.pop(fixture_id, None)
            continue

        for event in events:
            key = (event.get("time", {}).get("elapsed"), event.get("type"), event.get("player", {}).get("name"))
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

        if fixture_id in alertes_cotes:
            cotes = await get_cotes_live(fixture_id)
            if cotes:
                precedentes = info.get("cotes_precedentes", {})
                if precedentes:
                    for cle in ("home", "draw", "away"):
                        avant = precedentes.get(cle, 0)
                        apres = cotes.get(cle, 0)
                        if avant and apres and abs(apres - avant) >= 0.15:
                            embed = discord.Embed(
                                title=f"{E['chart']} MOUVEMENT DE COTES",
                                description=f"**{info['home']}** vs **{info['away']}**",
                                color=COLOR_COTE,
                                timestamp=datetime.now(timezone.utc)
                            )
                            noms = {"home": f"🏠 {info['home']}", "draw": "🤝 Nul", "away": f"✈️ {info['away']}"}
                            for k, label in noms.items():
                                a = precedentes.get(k, "?")
                                b = cotes.get(k, "?")
                                if a != "?" and b != "?":
                                    diff   = b - a
                                    fleche = "📈" if diff > 0 else "📉"
                                    embed.add_field(name=label, value=f"{a:.2f} → **{b:.2f}** {fleche}", inline=True)
                            await channel.send(embed=embed)
                            break
                info["cotes_precedentes"] = cotes


async def get_cotes_live(fixture_id: int) -> dict | None:
    async with aiohttp.ClientSession() as session:
        async with session.get(f"{FOOTBALL_API_URL}/odds/live", headers=HEADERS, params={"fixture": fixture_id}) as r:
            data = await r.json()
            if not data.get("response"):
                return None
            for bk in data["response"][0].get("bookmakers", []):
                for bet in bk.get("bets", []):
                    if bet["name"] == "Match Winner":
                        cotes = {}
                        for val in bet["values"]:
                            if val["value"] == "Home":  cotes["home"] = float(val["odd"])
                            elif val["value"] == "Draw": cotes["draw"] = float(val["odd"])
                            elif val["value"] == "Away": cotes["away"] = float(val["odd"])
                        return cotes
    return None


@tasks.loop(hours=6)
async def surveiller_blessures():
    channel = bot.get_channel(ALERT_CHANNEL_ID)
    if not channel or not paris_actifs:
        return
    equipes = set()
    for info in paris_actifs.values():
        equipes.add(info["home"])
        equipes.add(info["away"])
    try:
        async with aiohttp.ClientSession() as session:
            for equipe in equipes:
                async with session.get(f"{FOOTBALL_API_URL}/injuries", headers=HEADERS,
                    params={"team": equipe, "season": datetime.now().year}) as r:
                    data = await r.json()
                    for inj in data.get("response", [])[:3]:
                        joueur = inj.get("player", {}).get("name", "Inconnu")
                        type_  = inj.get("player", {}).get("reason", "Blessure")
                        key    = f"{equipe}_{joueur}"
                        if key not in blessures_alertees:
                            blessures_alertees.add(key)
                            embed = discord.Embed(
                                title=f"🚑 BLESSURE - {joueur}",
                                description=f"**{equipe}** - {type_}",
                                color=0xFF6600,
                                timestamp=datetime.now(timezone.utc)
                            )
                            embed.set_footer(text="Info blessure - Peut impacter les cotes !")
                            await channel.send(embed=embed)
    except Exception:
        pass


@tasks.loop(hours=24)
async def nettoyer_duels_expires():
    con = db()
    cur = con.cursor()
    expiration = (datetime.now(timezone.utc) - timedelta(hours=48)).strftime("%Y-%m-%d %H:%M:%S")
    cur.execute("DELETE FROM duels WHERE statut='en_attente' AND date_creation < ?", (expiration,))
    con.commit()
    con.close()


# ══════════════════════════════════════════════════════════════
#  EVENEMENT : BIENVENUE
# ══════════════════════════════════════════════════════════════

@bot.event
async def on_invite_create(invite: discord.Invite):
    invites_cache[invite.code] = {
        "uses":           invite.uses or 0,
        "inviter_id":     invite.inviter.id if invite.inviter else None,
        "inviter_pseudo": invite.inviter.display_name if invite.inviter else "Inconnu",
    }

@bot.event
async def on_invite_delete(invite: discord.Invite):
    invites_cache.pop(invite.code, None)

@bot.event
async def on_member_join(member: discord.Member):
    channel = bot.get_channel(ALERT_CHANNEL_ID)
    if not channel:
        return

    # Detecte qui a parraine ce membre
    parrain_id     = None
    parrain_pseudo = None
    total_parrainages = 0

    try:
        guild        = member.guild
        new_invites  = await guild.invites()
        for invite in new_invites:
            cached = invites_cache.get(invite.code)
            if cached and invite.uses > cached["uses"]:
                parrain_id     = cached["inviter_id"]
                parrain_pseudo = cached["inviter_pseudo"]
                cached["uses"] = invite.uses
                break

        # Met a jour le parrainage en base
        if parrain_id:
            con = db()
            cur = con.cursor()
            cur.execute(
                "INSERT OR IGNORE INTO parrainage (user_id, pseudo) VALUES (?,?)",
                (str(parrain_id), parrain_pseudo)
            )
            cur.execute(
                "UPDATE parrainage SET parrainages=parrainages+1 WHERE user_id=?",
                (str(parrain_id),)
            )
            cur.execute(
                "SELECT parrainages FROM parrainage WHERE user_id=?",
                (str(parrain_id),)
            )
            row = cur.fetchone()
            total_parrainages = row[0] if row else 1

            # Verifie si recompense debloquee
            recompense = None
            if total_parrainages == 10:  recompense = "1 semaine VIP gratuite"
            elif total_parrainages == 30: recompense = "1 mois VIP gratuit"
            elif total_parrainages == 60: recompense = "3 mois VIP gratuits"

            con.commit()
            con.close()

            if recompense:
                await channel.send(
                    f"🎉 <@{parrain_id}> vient de debloquer **{recompense}** grace a ses {total_parrainages} parrainages ! Contacte l admin pour l activer."
                )
    except Exception:
        pass

    # Message de bienvenue
    embed = discord.Embed(
        title=f"{E['wave']} Bienvenue sur le serveur !",
        description=f"Salut {member.mention}, bienvenue sur le serveur de paris sportifs !",
        color=COLOR_VIP,
        timestamp=datetime.now(timezone.utc)
    )

    if parrain_pseudo and parrain_id:
        embed.add_field(
            name="👥 Parrainage",
            value=f"**{member.display_name}** a rejoint grace a **{parrain_pseudo}** qui a maintenant **{total_parrainages} parrainage(s)** !",
            inline=False
        )

    embed.add_field(
        name="🆓 Commandes disponibles pour tous",
        value=(
            "`/vip` - Voir les avantages VIP\n"
            "`/duel` - Defier un membre\n"
            "`/roue` - Roue de la fortune (1x/semaine)\n"
            "`/parrainage` - Ton lien de parrainage\n"
            "`/bankroll` - Gerer ta bankroll\n"
            "`/classement-duels` - Classement des duels"
        ),
        inline=False
    )
    embed.add_field(
        name=f"{E['vip']} Commandes VIP Patreon",
        value=(
            "`/cote-compare` - Comparer les cotes\n"
            "`/value` - Calculer un value bet\n"
            "`/resultat` - Scores passes\n"
            "`/prono` - Sondage de pronos"
        ),
        inline=False
    )
    embed.add_field(
        name="💰 Devenir VIP",
        value="Abonne-toi sur Patreon pour acceder a toutes les fonctionnalites premium !",
        inline=False
    )
    embed.set_thumbnail(url=member.display_avatar.url)
    embed.set_footer(text="Bonne chance dans tes paris !")
    await channel.send(embed=embed)


# ══════════════════════════════════════════════════════════════
#  COMMANDES ADMIN
# ══════════════════════════════════════════════════════════════

@tree.command(name="suivre", description="🔴 Suivre un match en live (Admin)")
@app_commands.describe(equipe1="Premiere equipe", equipe2="Deuxieme equipe")
async def cmd_suivre(interaction: discord.Interaction, equipe1: str, equipe2: str):
    if not check_admin(interaction):
        await refus_admin(interaction); return
    await interaction.response.defer()
    matchs = await rechercher_match(equipe1, equipe2)
    if not matchs:
        await interaction.followup.send(f"❌ Aucun match trouve entre **{equipe1}** et **{equipe2}** aujourd hui.")
        return
    fixture    = matchs[0]
    fixture_id = fixture["fixture"]["id"]
    home       = fixture["teams"]["home"]["name"]
    away       = fixture["teams"]["away"]["name"]
    statut     = fixture["fixture"]["status"]["long"]
    if fixture_id not in paris_actifs:
        paris_actifs[fixture_id] = {
            "home": home, "away": away, "paris": [],
            "last_events": set(), "status": fixture["fixture"]["status"]["short"],
            "cotes_precedentes": {},
        }
    embed = discord.Embed(title=f"{E['live']} Surveillance activee !", description=f"**{home}** vs **{away}**", color=COLOR_KICKOFF, timestamp=datetime.now(timezone.utc))
    embed.add_field(name="Statut", value=statut, inline=True)
    embed.add_field(name="Alertes", value="Buts - Cartons - Mi-temps - Fin de match", inline=False)
    await interaction.followup.send(embed=embed)


@tree.command(name="pari", description="🎰 Enregistrer un pari (Admin)")
@app_commands.describe(equipe1="Premiere equipe", equipe2="Deuxieme equipe", pari="Ton pari", cote="Cote")
async def cmd_pari(interaction: discord.Interaction, equipe1: str, equipe2: str, pari: str, cote: float = None):
    if not check_admin(interaction):
        await refus_admin(interaction); return
    await interaction.response.defer()
    matchs = await rechercher_match(equipe1, equipe2)
    if not matchs:
        await interaction.followup.send(f"❌ Aucun match trouve entre **{equipe1}** et **{equipe2}** aujourd hui.")
        return
    fixture    = matchs[0]
    fixture_id = fixture["fixture"]["id"]
    home       = fixture["teams"]["home"]["name"]
    away       = fixture["teams"]["away"]["name"]
    if fixture_id not in paris_actifs:
        paris_actifs[fixture_id] = {
            "home": home, "away": away, "paris": [],
            "last_events": set(), "status": fixture["fixture"]["status"]["short"],
            "cotes_precedentes": {},
        }
    paris_actifs[fixture_id]["paris"].append({
        "user_id": interaction.user.id, "pseudo": interaction.user.display_name,
        "pari": pari, "cote": cote,
    })
    embed = discord.Embed(title=f"{E['bet']} Pari enregistre !", description=f"**{home}** vs **{away}**", color=COLOR_INFO, timestamp=datetime.now(timezone.utc))
    embed.add_field(name="Pari",  value=pari,                                    inline=True)
    embed.add_field(name="Cote",  value=f"x{cote}" if cote else "Non renseignee", inline=True)
    embed.set_footer(text=f"Parieur : {interaction.user.display_name}")
    await interaction.followup.send(embed=embed)


@tree.command(name="cotes", description="📈 Activer alertes cotes (Admin)")
@app_commands.describe(equipe1="Premiere equipe", equipe2="Deuxieme equipe")
async def cmd_cotes(interaction: discord.Interaction, equipe1: str, equipe2: str):
    if not check_admin(interaction):
        await refus_admin(interaction); return
    await interaction.response.defer()
    matchs = await rechercher_match(equipe1, equipe2)
    if not matchs:
        await interaction.followup.send(f"❌ Aucun match trouve."); return
    fixture    = matchs[0]
    fixture_id = fixture["fixture"]["id"]
    home = fixture["teams"]["home"]["name"]
    away = fixture["teams"]["away"]["name"]
    alertes_cotes[fixture_id] = {"home": home, "away": away}
    if fixture_id not in paris_actifs:
        paris_actifs[fixture_id] = {
            "home": home, "away": away, "paris": [],
            "last_events": set(), "status": fixture["fixture"]["status"]["short"],
            "cotes_precedentes": {},
        }
    embed = discord.Embed(title=f"{E['chart']} Alertes cotes activees !", description=f"**{home}** vs **{away}**", color=COLOR_COTE)
    embed.add_field(name="Declenchement", value="Alerte si une cote bouge de 0.15 ou plus", inline=False)
    await interaction.followup.send(embed=embed)


@tree.command(name="classement", description="🏆 Top 10 des meilleurs parieurs (Admin)")
async def cmd_classement(interaction: discord.Interaction):
    if not check_admin(interaction):
        await refus_admin(interaction); return
    con = db()
    cur = con.cursor()
    cur.execute("SELECT pseudo, paris, gagnes, perdus, points FROM leaderboard ORDER BY points DESC LIMIT 10")
    rows = cur.fetchall()
    con.close()
    if not rows:
        await interaction.response.send_message("Aucun pari enregistre pour l instant.", ephemeral=True); return
    embed = discord.Embed(title=f"{E['crown']} Classement des Parieurs", color=COLOR_WIN, timestamp=datetime.now(timezone.utc))
    medailles = ["🥇", "🥈", "🥉"]
    lignes = []
    for i, (pseudo, paris, gagnes, perdus, points) in enumerate(rows):
        medaille = medailles[i] if i < 3 else f"#{i+1}"
        taux     = round(gagnes / paris * 100) if paris > 0 else 0
        lignes.append(f"{medaille} **{pseudo}** - {points} pts - {gagnes}W/{perdus}L ({taux}%)")
    embed.description = "\n".join(lignes)
    await interaction.response.send_message(embed=embed)


@tree.command(name="matchs", description="📋 Matchs surveilles (Admin)")
async def cmd_matchs(interaction: discord.Interaction):
    if not check_admin(interaction):
        await refus_admin(interaction); return
    if not paris_actifs:
        await interaction.response.send_message("Aucun match en surveillance.", ephemeral=True); return
    embed = discord.Embed(title=f"{E['live']} Matchs surveilles", color=COLOR_INFO, timestamp=datetime.now(timezone.utc))
    for fid, info in paris_actifs.items():
        parieurs  = ", ".join(f"<@{p['user_id']}>" for p in info["paris"]) or "Aucun"
        paris_txt = "\n".join(f"- {p['pari']}" + (f" (x{p['cote']})" if p.get("cote") else "") for p in info["paris"]) or "Surveillance simple"
        embed.add_field(name=f"⚽ {info['home']} vs {info['away']}", value=f"**Parieurs :** {parieurs}\n{paris_txt}", inline=False)
    await interaction.response.send_message(embed=embed)


@tree.command(name="stop", description="🛑 Arreter la surveillance (Admin)")
@app_commands.describe(equipe="Nom d une equipe")
async def cmd_stop(interaction: discord.Interaction, equipe: str):
    if not check_admin(interaction):
        await refus_admin(interaction); return
    retires = [fid for fid, info in paris_actifs.items() if equipe.lower() in info["home"].lower() or equipe.lower() in info["away"].lower()]
    if not retires:
        await interaction.response.send_message(f"❌ Aucun match avec **{equipe}**.", ephemeral=True); return
    for fid in retires:
        paris_actifs.pop(fid, None)
        alertes_cotes.pop(fid, None)
    await interaction.response.send_message(f"✅ Surveillance arretee pour {len(retires)} match(s).", ephemeral=True)


@tree.command(name="stats", description="📊 Stats recentes d une equipe (Admin)")
@app_commands.describe(equipe="Nom de l equipe")
async def cmd_stats(interaction: discord.Interaction, equipe: str):
    if not check_admin(interaction):
        await refus_admin(interaction); return
    await interaction.response.defer()
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{FOOTBALL_API_URL}/fixtures", headers=HEADERS, params={"team": equipe, "last": "5", "status": "FT"}) as r:
                data   = await r.json()
                matchs = data.get("response", [])
        if not matchs:
            await interaction.followup.send(f"❌ Aucune stat trouvee pour **{equipe}**. Essaie le nom en anglais."); return
        embed = discord.Embed(title=f"📊 Stats recentes - {equipe}", color=COLOR_INFO, timestamp=datetime.now(timezone.utc))
        buts_m = buts_e = victoires = defaites = nuls = 0
        for f in matchs:
            home    = f["teams"]["home"]["name"]
            away    = f["teams"]["away"]["name"]
            score_h = f["goals"]["home"] or 0
            score_a = f["goals"]["away"] or 0
            date    = f["fixture"]["date"][:10]
            est_home = equipe.lower() in home.lower()
            buts_m += score_h if est_home else score_a
            buts_e += score_a if est_home else score_h
            my_score = score_h if est_home else score_a
            opp_score = score_a if est_home else score_h
            if my_score > opp_score:   victoires += 1
            elif my_score < opp_score: defaites  += 1
            else:                      nuls      += 1
            embed.add_field(name=f"📅 {date}", value=f"**{home} {score_h} - {score_a} {away}**", inline=False)
        embed.add_field(name="✅ V", value=str(victoires), inline=True)
        embed.add_field(name="🤝 N", value=str(nuls),      inline=True)
        embed.add_field(name="❌ D", value=str(defaites),  inline=True)
        embed.add_field(name="⚽ Buts marques",   value=str(buts_m), inline=True)
        embed.add_field(name="🥅 Buts encaisses", value=str(buts_e), inline=True)
        embed.add_field(name="🔒 Clean sheets",   value=str(sum(1 for f in matchs if (f["goals"]["away"] or 0) == 0)), inline=True)
        await interaction.followup.send(embed=embed)
    except Exception as e:
        await interaction.followup.send(f"❌ Erreur : {e}")


@tree.command(name="challenge", description="🏆 Lancer le challenge de la semaine (Admin)")
@app_commands.describe(equipe1="Premiere equipe", equipe2="Deuxieme equipe", question="Question du challenge")
async def cmd_challenge(interaction: discord.Interaction, equipe1: str, equipe2: str, question: str):
    if not check_admin(interaction):
        await refus_admin(interaction); return
    challenge_semaine.clear()
    challenge_semaine.update({"match": f"{equipe1} vs {equipe2}", "question": question, "reponses": {}, "termine": False})
    embed = discord.Embed(title="🏆 CHALLENGE DE LA SEMAINE !", description=f"**{equipe1}** vs **{equipe2}**", color=COLOR_VIP, timestamp=datetime.now(timezone.utc))
    embed.add_field(name="❓ Question",    value=question, inline=False)
    embed.add_field(name="📌 Participer", value="Tape `/repondre-challenge ta_reponse:TA REPONSE`", inline=False)
    await interaction.response.send_message(embed=embed)


@tree.command(name="resultats-challenge", description="📊 Voir les reponses au challenge (Admin)")
async def cmd_resultats_challenge(interaction: discord.Interaction):
    if not check_admin(interaction):
        await refus_admin(interaction); return
    if not challenge_semaine:
        await interaction.response.send_message("❌ Aucun challenge actif.", ephemeral=True); return
    embed = discord.Embed(title="📊 Reponses au Challenge", description=f"**{challenge_semaine['match']}** - {challenge_semaine['question']}", color=COLOR_VIP)
    reponses = challenge_semaine.get("reponses", {})
    lignes   = [f"**{v['pseudo']}** : {v['reponse']}" for v in reponses.values()] or ["Aucune reponse"]
    embed.add_field(name=f"Participants ({len(reponses)})", value="\n".join(lignes[:20]), inline=False)
    await interaction.response.send_message(embed=embed)


@tree.command(name="gagner-duel", description="🏆 Declarer le gagnant d un duel (Admin)")
@app_commands.describe(gagnant="Membre gagnant", perdant="Membre perdant")
async def cmd_gagner_duel(interaction: discord.Interaction, gagnant: discord.Member, perdant: discord.Member):
    if not check_admin(interaction):
        await refus_admin(interaction); return
    con = db()
    cur = con.cursor()
    cur.execute("""
        SELECT duel_id, match, pari_challenger, pari_adversaire, challenger_id, adversaire_id
        FROM duels WHERE statut='accepte'
        AND ((challenger_id=? AND adversaire_id=?) OR (challenger_id=? AND adversaire_id=?))
    """, (str(gagnant.id), str(perdant.id), str(perdant.id), str(gagnant.id)))
    row = cur.fetchone()
    if not row:
        con.close()
        await interaction.response.send_message("❌ Aucun duel accepte entre ces deux membres.", ephemeral=True); return
    duel_id, match, pari_c, pari_a, chal_id, adv_id = row
    pari_gagnant = pari_c if chal_id == str(gagnant.id) else pari_a
    pari_perdant = pari_a if chal_id == str(gagnant.id) else pari_c
    cur.execute("UPDATE duels SET statut='termine' WHERE duel_id=?", (duel_id,))
    date_str = datetime.now(timezone.utc).strftime("%d/%m/%Y")
    for uid, pseudo, resultat, mon_pari, adv_pseudo in [
        (str(gagnant.id), gagnant.display_name, "gagne", pari_gagnant, perdant.display_name),
        (str(perdant.id), perdant.display_name, "perdu", pari_perdant, gagnant.display_name),
    ]:
        cur.execute("INSERT OR IGNORE INTO classement_duels (user_id, pseudo) VALUES (?, ?)", (uid, pseudo))
        cur.execute("UPDATE classement_duels SET pseudo=? WHERE user_id=?", (pseudo, uid))
        if resultat == "gagne":
            cur.execute("UPDATE classement_duels SET gagnes=gagnes+1, serie=serie+1 WHERE user_id=?", (uid,))
        else:
            cur.execute("UPDATE classement_duels SET perdus=perdus+1, serie=0 WHERE user_id=?", (uid,))
        cur.execute("INSERT INTO historique_duels (user_id, adversaire, match, pari, resultat, date) VALUES (?,?,?,?,?,?)",
            (uid, adv_pseudo, match, mon_pari, resultat, date_str))
    con.commit()
    con.close()
    embed = discord.Embed(title="🏆 DUEL TERMINE !", description=f"**{gagnant.display_name}** remporte le duel contre **{perdant.display_name}** !", color=COLOR_VIP, timestamp=datetime.now(timezone.utc))
    embed.add_field(name="⚽ Match", value=match, inline=False)
    embed.add_field(name=f"🏆 {gagnant.display_name}", value=pari_gagnant, inline=True)
    embed.add_field(name=f"💸 {perdant.display_name}", value=pari_perdant, inline=True)
    await interaction.response.send_message(embed=embed)


# ══════════════════════════════════════════════════════════════
#  COMMANDES VIP (Patreon)
# ══════════════════════════════════════════════════════════════

@tree.command(name="cote-compare", description="💎 Comparer les cotes entre bookmakers (VIP)")
@app_commands.describe(equipe1="Premiere equipe", equipe2="Deuxieme equipe")
async def cmd_cote_compare(interaction: discord.Interaction, equipe1: str, equipe2: str):
    if not check_vip(interaction):
        await refus_vip(interaction); return
    await interaction.response.defer()
    try:
        matchs = await rechercher_match(equipe1, equipe2)
        if not matchs:
            await interaction.followup.send(f"❌ Aucun match trouve entre **{equipe1}** et **{equipe2}**."); return
        fixture_id = matchs[0]["fixture"]["id"]
        home       = matchs[0]["teams"]["home"]["name"]
        away       = matchs[0]["teams"]["away"]["name"]
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{FOOTBALL_API_URL}/odds", headers=HEADERS, params={"fixture": fixture_id}) as r:
                data = await r.json()
        if not data.get("response"):
            await interaction.followup.send("❌ Aucune cote disponible pour ce match."); return
        embed = discord.Embed(title=f"📊 Comparaison des cotes - {home} vs {away}", color=COLOR_COTE, timestamp=datetime.now(timezone.utc))
        count = 0
        for bk in data["response"][0].get("bookmakers", [])[:6]:
            nom_bk = bk.get("name", "?")
            for bet in bk.get("bets", []):
                if bet["name"] == "Match Winner":
                    c = {v["value"]: v["odd"] for v in bet["values"]}
                    embed.add_field(name=f"🏦 {nom_bk}", value=f"🏠 {c.get('Home','?')}  |  🤝 {c.get('Draw','?')}  |  ✈️ {c.get('Away','?')}", inline=False)
                    count += 1; break
        if count == 0:
            await interaction.followup.send("❌ Aucune cote 1X2 disponible."); return
        embed.set_footer(text=f"🏠 {home}  |  🤝 Nul  |  ✈️ {away}")
        await interaction.followup.send(embed=embed)
    except Exception as e:
        await interaction.followup.send(f"❌ Erreur : {e}")


@tree.command(name="value", description="💎 Calculer si une cote est un value bet (VIP)")
@app_commands.describe(cote="La cote du bookmaker (ex: 2.50)", probabilite="Ta probabilite en % (ex: 45)")
async def cmd_value(interaction: discord.Interaction, cote: float, probabilite: float):
    if not check_vip(interaction):
        await refus_vip(interaction); return
    prob_implicite = round((1 / cote) * 100, 1)
    value          = round((probabilite / 100) * cote - 1, 3)
    est_value      = value > 0
    embed = discord.Embed(
        title=f"{'✅ VALUE BET !' if est_value else '❌ Pas de value'}",
        description=f"Cote **{cote}** - Probabilite estimee **{probabilite}%**",
        color=COLOR_WIN if est_value else COLOR_LOSS,
        timestamp=datetime.now(timezone.utc)
    )
    embed.add_field(name="Proba bookmaker", value=f"{prob_implicite}%",                                        inline=True)
    embed.add_field(name="Ta proba",        value=f"{probabilite}%",                                          inline=True)
    embed.add_field(name="Edge",            value=f"{'+' if value >= 0 else ''}{round(value*100, 1)}%",        inline=True)
    if est_value:
        kelly = max(0, round((probabilite / 100 - (1 - probabilite / 100) / (cote - 1)) * 100, 1))
        embed.add_field(name="💰 Mise Kelly", value=f"**{kelly}%** de ta bankroll", inline=False)
        embed.set_footer(text="Value positive = esperance mathematique favorable !")
    else:
        embed.set_footer(text="La cote ne reflète pas ta probabilite estimee.")
    await interaction.response.send_message(embed=embed)


@tree.command(name="resultat", description="💎 Chercher un score passe (VIP)")
@app_commands.describe(equipe1="Premiere equipe", equipe2="Deuxieme equipe")
async def cmd_resultat(interaction: discord.Interaction, equipe1: str, equipe2: str):
    if not check_vip(interaction):
        await refus_vip(interaction); return
    await interaction.response.defer()
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{FOOTBALL_API_URL}/fixtures", headers=HEADERS, params={"last": "10", "status": "FT"}) as r:
                data  = await r.json()
                matchs = filtrer(data.get("response", []), equipe1, equipe2)
        if not matchs:
            await interaction.followup.send(f"❌ Aucun resultat recent entre **{equipe1}** et **{equipe2}**."); return
        embed = discord.Embed(title=f"🔍 Resultats recents - {equipe1} vs {equipe2}", color=COLOR_INFO, timestamp=datetime.now(timezone.utc))
        for f in matchs[:5]:
            home    = f["teams"]["home"]["name"]
            away    = f["teams"]["away"]["name"]
            score_h = f["goals"]["home"] or 0
            score_a = f["goals"]["away"] or 0
            date    = f["fixture"]["date"][:10]
            ligue   = f["league"]["name"]
            embed.add_field(name=f"📅 {date} - {ligue}", value=f"**{home} {score_h} - {score_a} {away}**", inline=False)
        await interaction.followup.send(embed=embed)
    except Exception as e:
        await interaction.followup.send(f"❌ Erreur : {e}")


@tree.command(name="prono", description="💎 Lancer un sondage de pronos (VIP)")
@app_commands.describe(equipe1="Premiere equipe", equipe2="Deuxieme equipe")
async def cmd_prono(interaction: discord.Interaction, equipe1: str, equipe2: str):
    if not check_vip(interaction):
        await refus_vip(interaction); return
    embed = discord.Embed(title="📊 Sondage Pronostics", description=f"**{equipe1}** vs **{equipe2}**\nVote pour ton pronostic !", color=0x5865F2, timestamp=datetime.now(timezone.utc))
    embed.add_field(name="🏠 Victoire domicile",  value="Reagis avec 1️⃣", inline=True)
    embed.add_field(name="🤝 Match nul",           value="Reagis avec 2️⃣", inline=True)
    embed.add_field(name="✈️ Victoire exterieur", value="Reagis avec 3️⃣", inline=True)
    embed.set_footer(text=f"Sondage lance par {interaction.user.display_name}")
    await interaction.response.send_message(embed=embed)
    msg = await interaction.original_response()
    await msg.add_reaction("1️⃣")
    await msg.add_reaction("2️⃣")
    await msg.add_reaction("3️⃣")


# ══════════════════════════════════════════════════════════════
#  COMMANDES TOUT LE MONDE
# ══════════════════════════════════════════════════════════════

@tree.command(name="vip", description="👑 Voir les avantages VIP Patreon")
async def cmd_vip(interaction: discord.Interaction):
    est_vip = check_vip(interaction)
    if est_vip:
        embed = discord.Embed(title=f"{E['vip']} Bienvenue dans l espace VIP !", description=f"Bonjour **{interaction.user.display_name}** ! Tu as acces a toutes les fonctionnalites premium.", color=COLOR_VIP, timestamp=datetime.now(timezone.utc))
        embed.add_field(name="Fonctions VIP disponibles", value="`/cote-compare` `/value` `/resultat` `/prono`", inline=False)
        embed.set_footer(text="Merci pour ton soutien sur Patreon !")
    else:
        embed = discord.Embed(title=f"{E['vip']} Deviens VIP Patreon !", description="Debloque toutes les fonctionnalites premium !", color=COLOR_VIP)
        embed.add_field(name=f"{E['lock']} Fonctions VIP", value="`/cote-compare` - Comparer les cotes\n`/value` - Calculer un value bet\n`/resultat` - Scores passes\n`/prono` - Sondages de pronos", inline=False)
        embed.add_field(name="💰 S abonner", value="Rejoins notre Patreon pour acceder a tout ca !", inline=False)
    await interaction.response.send_message(embed=embed, ephemeral=True)


@tree.command(name="duel", description="⚔️ Defier un membre sur un pronostic")
@app_commands.describe(adversaire="Le membre a defier", equipe1="Premiere equipe", equipe2="Deuxieme equipe", ton_pari="Ton pronostic")
async def cmd_duel(interaction: discord.Interaction, adversaire: discord.Member, equipe1: str, equipe2: str, ton_pari: str):
    if adversaire.id == interaction.user.id:
        await interaction.response.send_message("❌ Tu ne peux pas te defier toi-meme !", ephemeral=True); return
    duel_id  = f"{interaction.user.id}_{adversaire.id}_{int(datetime.now().timestamp())}"
    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    con = db()
    cur = con.cursor()
    cur.execute("INSERT INTO duels (duel_id, challenger_id, challenger_pseudo, adversaire_id, adversaire_pseudo, match, pari_challenger, statut, date_creation) VALUES (?,?,?,?,?,?,?,?,?)",
        (duel_id, str(interaction.user.id), interaction.user.display_name, str(adversaire.id), adversaire.display_name, f"{equipe1} vs {equipe2}", ton_pari, "en_attente", date_str))
    con.commit()
    con.close()
    embed = discord.Embed(title="⚔️ DUEL LANCE !", description=f"{interaction.user.mention} defie {adversaire.mention} !", color=0xFF8800, timestamp=datetime.now(timezone.utc))
    embed.add_field(name="⚽ Match",              value=f"{equipe1} vs {equipe2}", inline=False)
    embed.add_field(name="🎯 Pari challenger",    value=ton_pari,                  inline=True)
    embed.add_field(name="❓ Pari adversaire",    value="En attente...",            inline=True)
    embed.add_field(name="📌 Pour accepter",      value=f"Tape `/accepter-duel adversaire:{interaction.user.display_name} ton_pari:TON PRONOSTIC`", inline=False)
    await interaction.response.send_message(embed=embed)


@tree.command(name="accepter-duel", description="✅ Accepter un duel")
@app_commands.describe(adversaire="Le membre qui t a defie", ton_pari="Ton pronostic")
async def cmd_accepter_duel(interaction: discord.Interaction, adversaire: discord.Member, ton_pari: str):
    con = db()
    cur = con.cursor()
    cur.execute("SELECT duel_id, match, pari_challenger FROM duels WHERE challenger_id=? AND adversaire_id=? AND statut='en_attente'", (str(adversaire.id), str(interaction.user.id)))
    row = cur.fetchone()
    if not row:
        con.close()
        await interaction.response.send_message(f"❌ Aucun duel en attente de **{adversaire.display_name}**.", ephemeral=True); return
    duel_id, match, pari_c = row
    cur.execute("UPDATE duels SET pari_adversaire=?, statut='accepte' WHERE duel_id=?", (ton_pari, duel_id))
    con.commit()
    con.close()
    embed = discord.Embed(title="✅ DUEL ACCEPTE !", description=f"**{adversaire.display_name}** vs **{interaction.user.display_name}**", color=COLOR_WIN, timestamp=datetime.now(timezone.utc))
    embed.add_field(name="⚽ Match",                         value=match,   inline=False)
    embed.add_field(name=f"🎯 {adversaire.display_name}",   value=pari_c,  inline=True)
    embed.add_field(name=f"🎯 {interaction.user.display_name}", value=ton_pari, inline=True)
    await interaction.response.send_message(embed=embed)


@tree.command(name="classement-duels", description="⚔️ Classement des duels")
async def cmd_classement_duels(interaction: discord.Interaction):
    con = db()
    cur = con.cursor()
    cur.execute("SELECT pseudo, gagnes, perdus, serie FROM classement_duels ORDER BY gagnes DESC, serie DESC LIMIT 10")
    rows = cur.fetchall()
    con.close()
    if not rows:
        await interaction.response.send_message("Aucun duel termine pour l instant.", ephemeral=True); return
    embed = discord.Embed(title="⚔️ Classement des Duels", color=0xFF8800, timestamp=datetime.now(timezone.utc))
    medailles = ["🥇", "🥈", "🥉"]
    lignes    = []
    for i, (pseudo, gagnes, perdus, serie) in enumerate(rows):
        medaille = medailles[i] if i < 3 else f"#{i+1}"
        total    = gagnes + perdus
        taux     = round(gagnes / total * 100) if total > 0 else 0
        serie_txt = f" {E['fire']}x{serie}" if serie >= 2 else ""
        lignes.append(f"{medaille} **{pseudo}** - {gagnes}V/{perdus}D ({taux}%){serie_txt}")
    embed.description = "\n".join(lignes)
    embed.set_footer(text="🔥 = serie de victoires consecutives")
    await interaction.response.send_message(embed=embed)


@tree.command(name="historique-duels", description="📜 Tes duels gagnes")
async def cmd_historique_duels(interaction: discord.Interaction):
    con = db()
    cur = con.cursor()
    cur.execute("SELECT adversaire, match, pari, date FROM historique_duels WHERE user_id=? AND resultat='gagne' ORDER BY id DESC LIMIT 10", (str(interaction.user.id),))
    rows = cur.fetchall()
    cur.execute("SELECT gagnes, perdus FROM classement_duels WHERE user_id=?", (str(interaction.user.id),))
    stats = cur.fetchone()
    con.close()
    if not rows:
        await interaction.response.send_message("Tu n as pas encore gagne de duel. Lance-en un avec `/duel` !", ephemeral=True); return
    embed = discord.Embed(title=f"🏆 Duels gagnes - {interaction.user.display_name}", color=COLOR_WIN, timestamp=datetime.now(timezone.utc))
    for adversaire, match, pari, date in rows:
        embed.add_field(name=f"⚔️ vs {adversaire} - {date}", value=f"**{match}** - Pari : {pari}", inline=False)
    if stats:
        embed.set_footer(text=f"Total : {stats[0]} gagnes - {stats[1]} perdus")
    await interaction.response.send_message(embed=embed)


@tree.command(name="bankroll", description="💰 Gerer ta bankroll")
@app_commands.describe(action="start / mise / bilan", montant="Montant en euros", resultat="gagne ou perdu")
async def cmd_bankroll(interaction: discord.Interaction, action: str, montant: float = None, resultat: str = None):
    uid = str(interaction.user.id)
    con = db()
    cur = con.cursor()

    if action == "start":
        if not montant:
            await interaction.response.send_message("❌ Precise ton montant : `/bankroll action:start montant:200`", ephemeral=True)
            con.close(); return
        cur.execute("INSERT OR REPLACE INTO bankrolls (user_id, pseudo, solde, initial) VALUES (?,?,?,?)", (uid, interaction.user.display_name, montant, montant))
        con.commit(); con.close()
        embed = discord.Embed(title="💰 Bankroll initialisee !", description=f"**{interaction.user.display_name}** demarre avec **{montant}€**", color=COLOR_WIN, timestamp=datetime.now(timezone.utc))
        await interaction.response.send_message(embed=embed)

    elif action == "mise":
        cur.execute("SELECT solde, initial FROM bankrolls WHERE user_id=?", (uid,))
        row = cur.fetchone()
        if not row:
            con.close()
            await interaction.response.send_message("❌ Initialise ta bankroll avec `/bankroll action:start montant:200`", ephemeral=True); return
        if not montant or not resultat:
            con.close()
            await interaction.response.send_message("❌ Precise montant et resultat (gagne/perdu).", ephemeral=True); return
        solde, initial = row
        gagne = "gagne" in resultat.lower()
        solde = max(0, solde + montant if gagne else solde - montant)
        cur.execute("UPDATE bankrolls SET solde=? WHERE user_id=?", (solde, uid))
        date_str = datetime.now(timezone.utc).strftime("%d/%m/%Y")
        cur.execute("INSERT INTO bankroll_historique (user_id, montant, resultat, solde, date) VALUES (?,?,?,?,?)", (uid, montant, "gagne" if gagne else "perdu", solde, date_str))
        con.commit(); con.close()
        diff = solde - initial
        embed = discord.Embed(title=f"{'✅ Mise gagnee !' if gagne else '❌ Mise perdue'}", color=COLOR_WIN if gagne else COLOR_LOSS, timestamp=datetime.now(timezone.utc))
        embed.add_field(name="Mise",          value=f"{montant}€",                                  inline=True)
        embed.add_field(name="Solde actuel",  value=f"**{solde:.2f}€**",                            inline=True)
        embed.add_field(name="ROI",           value=f"{'+' if diff >= 0 else ''}{round(diff/initial*100, 1)}%", inline=True)
        await interaction.response.send_message(embed=embed)

    elif action == "bilan":
        cur.execute("SELECT solde, initial FROM bankrolls WHERE user_id=?", (uid,))
        row = cur.fetchone()
        if not row:
            con.close()
            await interaction.response.send_message("❌ Aucune bankroll. Tape `/bankroll action:start montant:200`", ephemeral=True); return
        solde, initial = row
        cur.execute("SELECT COUNT(*), SUM(CASE WHEN resultat='gagne' THEN 1 ELSE 0 END) FROM bankroll_historique WHERE user_id=?", (uid,))
        total, gagnes = cur.fetchone()
        con.close()
        diff  = solde - initial
        embed = discord.Embed(title=f"💰 Bilan - {interaction.user.display_name}", color=COLOR_WIN if diff >= 0 else COLOR_LOSS, timestamp=datetime.now(timezone.utc))
        embed.add_field(name="Capital initial", value=f"{initial}€",             inline=True)
        embed.add_field(name="Solde actuel",    value=f"**{solde:.2f}€**",       inline=True)
        embed.add_field(name="ROI",             value=f"{'+' if diff >= 0 else ''}{round(diff/initial*100, 1)}%", inline=True)
        embed.add_field(name="Paris joues",     value=str(total or 0),           inline=True)
        embed.add_field(name="Gagnes",          value=str(gagnes or 0),          inline=True)
        embed.add_field(name="Perdus",          value=str((total or 0) - (gagnes or 0)), inline=True)
        await interaction.response.send_message(embed=embed)
    else:
        con.close()
        await interaction.response.send_message("❌ Action inconnue. Utilise `start`, `mise` ou `bilan`.", ephemeral=True)


@tree.command(name="repondre-challenge", description="📝 Repondre au challenge de la semaine")
@app_commands.describe(ta_reponse="Ta reponse")
async def cmd_repondre_challenge(interaction: discord.Interaction, ta_reponse: str):
    if not challenge_semaine or challenge_semaine.get("termine"):
        await interaction.response.send_message("❌ Aucun challenge actif.", ephemeral=True); return
    challenge_semaine["reponses"][str(interaction.user.id)] = {"pseudo": interaction.user.display_name, "reponse": ta_reponse}
    embed = discord.Embed(title="📝 Reponse enregistree !", color=0x5865F2, timestamp=datetime.now(timezone.utc))
    embed.add_field(name="Match",       value=challenge_semaine["match"],    inline=True)
    embed.add_field(name="Ta reponse",  value=ta_reponse,                    inline=False)
    await interaction.response.send_message(embed=embed, ephemeral=True)


@tree.command(name="aide", description="❓ Aide complete du bot")
async def cmd_aide(interaction: discord.Interaction):
    embed = discord.Embed(title="🎰 Bot Paris Sportifs - Toutes les commandes", color=COLOR_INFO)
    embed.add_field(name="🆓 Pour tous les membres", value="`/vip` `/duel` `/accepter-duel` `/classement-duels` `/historique-duels` `/bankroll` `/repondre-challenge` `/roue` `/parrainage` `/partager` `/classement-parrainages` `/aide`", inline=False)
    embed.add_field(name=f"{E['vip']} VIP Patreon uniquement", value="`/cote-compare` `/value` `/resultat` `/prono`", inline=False)
    embed.add_field(name=f"🔒 Admin {ROLE_ADMIN} uniquement", value="`/suivre` `/pari` `/cotes` `/classement` `/matchs` `/stop` `/stats` `/challenge` `/resultats-challenge` `/gagner-duel`", inline=False)
    embed.add_field(name="🔔 Alertes automatiques", value="⚽ Buts · 🟨🟥 Cartons · 🔔 Mi-temps · 🏁 Fin de match · 📈 Cotes · 🚑 Blessures", inline=False)
    embed.set_footer(text="Donnees : API-Football · Mise a jour toutes les 60s")
    await interaction.response.send_message(embed=embed)



# ══════════════════════════════════════════════════════════════
#  ROUE DE LA FORTUNE / PARRAINAGE / PARTAGER
# ══════════════════════════════════════════════════════════════

import random

ROUE_LOTS = [
    {"nom": "1 mois VIP GRATUIT",   "emoji": "💎", "prob": 5,  "type": "vip"},
    {"nom": "50 points bonus",       "emoji": "⭐", "prob": 10, "type": "points", "valeur": 50},
    {"nom": "20 points bonus",       "emoji": "🎯", "prob": 20, "type": "points", "valeur": 20},
    {"nom": "10 points bonus",       "emoji": "🎁", "prob": 30, "type": "points", "valeur": 10},
    {"nom": "Acces VIP 24h",         "emoji": "🔓", "prob": 15, "type": "vip24h"},
    {"nom": "Rien cette fois...",    "emoji": "💨", "prob": 20, "type": "rien"},
]

def tirer_lot():
    total = sum(l["prob"] for l in ROUE_LOTS)
    r     = random.randint(1, total)
    cumul = 0
    for lot in ROUE_LOTS:
        cumul += lot["prob"]
        if r <= cumul:
            return lot
    return ROUE_LOTS[-1]


@tree.command(name="roue", description="🎡 Tenter ta chance a la roue de la fortune (1 fois par semaine)")
async def cmd_roue(interaction: discord.Interaction):
    uid  = str(interaction.user.id)
    now  = datetime.now(timezone.utc)
    con  = db()
    cur  = con.cursor()
    cur.execute("SELECT derniere_roue FROM roue_fortune WHERE user_id=?", (uid,))
    row  = cur.fetchone()

    if row and row[0]:
        derniere = datetime.fromisoformat(row[0])
        diff     = now - derniere
        if diff.days < 7:
            jours_restants = 7 - diff.days
            heures         = 24 - (diff.seconds // 3600)
            con.close()
            embed = discord.Embed(
                title="⏳ Roue pas encore disponible !",
                description=f"Tu pourras retenter dans **{jours_restants} jour(s) et {heures}h**.",
                color=COLOR_LOSS
            )
            embed.set_footer(text="La roue se reinitialise chaque semaine !")
            await interaction.response.send_message(embed=embed, ephemeral=True)
            return

    # Tire le lot
    lot = tirer_lot()

    # Sauvegarde la date
    cur.execute(
        "INSERT OR REPLACE INTO roue_fortune (user_id, pseudo, derniere_roue) VALUES (?,?,?)",
        (uid, interaction.user.display_name, now.isoformat())
    )

    # Animation de la roue
    animation_frames = ["🎡 ...", "🎡 🎰 ...", "🎡 🎰 🎲 ...", "🎡 🎰 🎲 🎯 ..."]
    lots_display = " · ".join(f"{l['emoji']} {l['nom']}" for l in ROUE_LOTS)

    embed_anim = discord.Embed(
        title="🎡 La roue tourne...",
        description=lots_display,
        color=COLOR_VIP
    )
    await interaction.response.send_message(embed=embed_anim)
    await asyncio.sleep(2)

    # Resultat
    if lot["type"] == "vip":
        description = f"Tu gagnes **1 mois VIP GRATUIT** ! Contacte l admin pour l activer."
        couleur     = COLOR_VIP
    elif lot["type"] == "vip24h":
        description = f"Tu gagnes un **acces VIP 24h** ! Contacte l admin pour l activer."
        couleur     = COLOR_COTE
    elif lot["type"] == "points":
        valeur = lot.get("valeur", 10)
        cur.execute("INSERT OR IGNORE INTO leaderboard (user_id, pseudo) VALUES (?,?)", (uid, interaction.user.display_name))
        cur.execute("UPDATE leaderboard SET points = points + ? WHERE user_id=?", (valeur, uid))
        description = f"Tu gagnes **{valeur} points** sur le classement !"
        couleur     = COLOR_WIN
    else:
        description = "Pas de chance cette fois... Reviens la semaine prochaine !"
        couleur     = COLOR_INFO

    con.commit()
    con.close()

    embed_result = discord.Embed(
        title=f"{lot['emoji']} {lot['nom']} !",
        description=description,
        color=couleur,
        timestamp=datetime.now(timezone.utc)
    )
    embed_result.set_footer(text="Prochain tour disponible dans 7 jours !")
    await interaction.edit_original_response(embed=embed_result)


@tree.command(name="parrainage", description="👥 Voir ton lien de parrainage et tes recompenses")
async def cmd_parrainage(interaction: discord.Interaction):
    uid = str(interaction.user.id)
    con = db()
    cur = con.cursor()
    cur.execute("SELECT parrainages, points FROM parrainage WHERE user_id=?", (uid,))
    row = cur.fetchone()
    con.close()

    parrainages = row[0] if row else 0
    points      = row[1] if row else 0

    # Genere le lien d invitation du serveur
    guild   = interaction.guild
    invites = await guild.invites()
    lien    = invites[0].url if invites else "Demande a l admin de creer un lien d invitation"

    embed = discord.Embed(
        title="👥 Ton Programme de Parrainage",
        description=f"Invite des amis et gagne des recompenses !",
        color=COLOR_VIP,
        timestamp=datetime.now(timezone.utc)
    )
    embed.add_field(name="🔗 Ton lien d invitation", value=lien, inline=False)
    embed.add_field(name="👥 Amis parraines", value=str(parrainages), inline=True)
    embed.add_field(name="⭐ Points gagnes",  value=str(points),      inline=True)
    embed.add_field(
        name="🎁 Recompenses",
        value=(
            "**10 parrainages** = 1 semaine VIP gratuite\n**30 parrainages** = 1 mois VIP gratuit\n**60 parrainages** = 3 mois VIP gratuits"
        ),
        inline=False
    )
    embed.add_field(
        name="📌 Comment ca marche ?",
        value="Partage ton lien. Quand un ami rejoint, dis-le a l admin avec `/valider-parrainage`.",
        inline=False
    )
    embed.set_footer(text="Plus tu invites, plus tu gagnes !")
    await interaction.response.send_message(embed=embed)


@tree.command(name="valider-parrainage", description="✅ Valider un parrainage (Admin)")
@app_commands.describe(parrain="Le membre qui a fait le parrainage", filleul="Le nouveau membre invite")
async def cmd_valider_parrainage(interaction: discord.Interaction, parrain: discord.Member, filleul: discord.Member):
    if not check_admin(interaction):
        await refus_admin(interaction); return

    uid = str(parrain.id)
    con = db()
    cur = con.cursor()
    cur.execute("INSERT OR IGNORE INTO parrainage (user_id, pseudo) VALUES (?,?)", (uid, parrain.display_name))
    cur.execute("UPDATE parrainage SET parrainages=parrainages+1, points=points+20 WHERE user_id=?", (uid,))
    cur.execute("SELECT parrainages FROM parrainage WHERE user_id=?", (uid,))
    total = cur.fetchone()[0]
    con.commit()
    con.close()

    embed = discord.Embed(
        title="✅ Parrainage valide !",
        description=f"**{parrain.display_name}** a parraine **{filleul.display_name}**",
        color=COLOR_WIN,
        timestamp=datetime.now(timezone.utc)
    )
    embed.add_field(name="Total parrainages", value=str(total), inline=True)
    embed.add_field(name="Points gagnes",     value="+20",      inline=True)

    recompense = None
    if total == 10:
        recompense = "1 semaine VIP gratuite"
    elif total == 30:
        recompense = "1 mois VIP gratuit"
    elif total == 60:
        recompense = "3 mois VIP gratuits"

    if recompense:
        embed.add_field(
            name=f"🎉 RECOMPENSE DEBLOQUEE !",
            value=f"{parrain.mention} gagne **{recompense}** !",
            inline=False
        )

    await interaction.response.send_message(embed=embed)


@tree.command(name="partager", description="📤 Generer une image de resultat a poster sur les reseaux")
@app_commands.describe(
    match="Le match (ex: Brazil 0-1 France)",
    pari="Ton pari gagnant (ex: France gagne)",
    cote="La cote de ton pari (ex: 2.50)",
    mise="Ta mise en euros (ex: 50)",
)
async def cmd_partager(
    interaction: discord.Interaction,
    match: str,
    pari: str,
    cote: float,
    mise: float,
):
    gains     = round(mise * cote, 2)
    benefice  = round(gains - mise, 2)
    guild     = interaction.guild
    nom_serveur = guild.name if guild else "Paris Sportifs"

    # Genere un embed visuel tres soigne a screenshot et partager
    embed = discord.Embed(
        title="🏆 PARI GAGNANT !",
        color=COLOR_WIN,
        timestamp=datetime.now(timezone.utc)
    )
    embed.add_field(name="⚽ Match",      value=f"**{match}**",              inline=False)
    embed.add_field(name="🎯 Pari",       value=f"**{pari}**",               inline=True)
    embed.add_field(name="📈 Cote",       value=f"**x{cote}**",              inline=True)
    embed.add_field(name="💶 Mise",       value=f"**{mise}€**",              inline=True)
    embed.add_field(name="💰 Gains",      value=f"**{gains}€**",             inline=True)
    embed.add_field(name="📊 Benefice",   value=f"**+{benefice}€**",         inline=True)
    embed.add_field(name="📅 Date",       value=datetime.now(timezone.utc).strftime("%d/%m/%Y"), inline=True)
    embed.add_field(
        name=f"🎰 {nom_serveur}",
        value="Rejoins notre communaute Discord pour les alertes live, les pronos VIP et bien plus !",
        inline=False
    )
    embed.set_footer(text=f"Communaute {nom_serveur} - Paris Sportifs Live")

    await interaction.response.send_message(
        content=(
            "📸 Fais un screenshot et poste-la sur TikTok/Twitter ! Mentionne le serveur dans ta caption 🔥"
        ),
        embed=embed
    )


@tree.command(name="classement-parrainages", description="👥 Voir le classement des parrainages")
async def cmd_classement_parrainages(interaction: discord.Interaction):
    con = db()
    cur = con.cursor()
    cur.execute("SELECT pseudo, parrainages, points FROM parrainage ORDER BY parrainages DESC LIMIT 10")
    rows = cur.fetchall()
    con.close()

    if not rows:
        await interaction.response.send_message("Aucun parrainage enregistre pour l instant.", ephemeral=True)
        return

    embed = discord.Embed(
        title="👥 Classement des Parrainages",
        description="Les membres qui font le plus grandir la communaute !",
        color=COLOR_VIP,
        timestamp=datetime.now(timezone.utc)
    )
    medailles = ["🥇", "🥈", "🥉"]
    lignes    = []
    for i, (pseudo, parrainages, points) in enumerate(rows):
        medaille = medailles[i] if i < 3 else f"#{i+1}"
        prochain = ""
        if parrainages < 10:  prochain = f" → {10 - parrainages} avant 1 semaine VIP"
        elif parrainages < 30: prochain = f" → {30 - parrainages} avant 1 mois VIP"
        elif parrainages < 60: prochain = f" → {60 - parrainages} avant 3 mois VIP"
        lignes.append(f"{medaille} **{pseudo}** - {parrainages} filleul(s){prochain}")
    embed.description = "\n".join(lignes)
    await interaction.response.send_message(embed=embed)


# ══════════════════════════════════════════════════════════════
#  DEMARRAGE
# ══════════════════════════════════════════════════════════════

@bot.event
async def on_ready():
    init_db()
    print(f"✅ Bot connecte : {bot.user}")
    await tree.sync()
    print("✅ Commandes slash synchronisees")
    surveiller_matchs.start()
    surveiller_blessures.start()
    nettoyer_duels_expires.start()
    # Charge le cache des invitations
    for guild in bot.guilds:
        try:
            invites = await guild.invites()
            for inv in invites:
                invites_cache[inv.code] = {
                    'uses': inv.uses or 0,
                    'inviter_id': inv.inviter.id if inv.inviter else None,
                    'inviter_pseudo': inv.inviter.display_name if inv.inviter else 'Inconnu',
                }
        except Exception:
            pass
    print(f"✅ Cache invitations charge ({len(invites_cache)} liens)")
    print(f"✅ Surveillance demarree (toutes les {CHECK_INTERVAL}s)")

if __name__ == "__main__":
    if not DISCORD_TOKEN:
        print("❌ DISCORD_TOKEN manquant dans .env")
    elif not FOOTBALL_API_KEY:
        print("❌ FOOTBALL_API_KEY manquant dans .env")
    else:
        bot.run(DISCORD_TOKEN)
