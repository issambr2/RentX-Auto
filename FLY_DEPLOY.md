# Déploiement sur Fly.io

Ce projet est configuré pour être déployé sur Fly.io.

## Prérequis

1. Installez la CLI Fly.io : [flyctl](https://fly.io/docs/hands-on/install-flyctl/)
2. Connectez-vous : `fly auth login`

## Étapes de déploiement

1. Initialisez l'application (si ce n'est pas déjà fait) :
   ```bash
   fly launch
   ```
   *Note : Répondez "No" à la question sur le Dockerfile si vous voulez utiliser celui existant.*

2. Déployez :
   ```bash
   fly deploy
   ```

## Persistance des données (SQLite)

Par défaut, les fichiers SQLite sont supprimés à chaque redémarrage de l'instance si vous n'utilisez pas de volume.

Pour rendre la base de données persistante :

1. Créez un volume :
   ```bash
   fly volumes create rentx_data --region cdg --size 1
   ```

2. Modifiez le `fly.toml` pour monter le volume :
   ```toml
   [[mounts]]
     source = "rentx_data"
     destination = "/data"
   ```

3. Ajoutez la variable d'environnement dans `fly.toml` :
   ```toml
   [env]
     DATABASE_PATH = "/data/database.sqlite"
   ```

## Secrets

Ajoutez vos clés API et secrets JWT via la CLI :
```bash
fly secrets set JWT_SECRET=votre_secret_tres_long
```
