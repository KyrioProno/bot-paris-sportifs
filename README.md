# bot-paris-sportifs

Deux projets cohabitent dans ce dépôt :

| Dossier | Contenu |
| --- | --- |
| `bot.py` (+ `Procfile`, `requirements.txt`) | Bot Discord « Paris Sportifs Live » — v7 (SQLite, VIP, salons dédiés). Inchangé. |
| `tactix/` | **TACTIX** — application de tactique et d'entraînement football (web, mobile-first). |

## TACTIX — « Dessine. Anime. Entraîne. »

Créer des tactiques, des exercices et des séances : terrain vectoriel réaliste, joueurs,
adversaires, gardiens, ballons, matériel, trajectoires intelligentes dessinées au doigt,
étapes automatiques, animation, export image/PDF et mode présentation.

```bash
cd tactix
npm install
npm run dev      # http://localhost:5173
npm test         # autotests du moteur + rendu
```

Voir [`tactix/README.md`](tactix/README.md) pour la documentation complète
(fonctionnalités, gestes tactiles, architecture, tests).
