# Guide Dhokkar Rent a Car : Déploiement o2switch Stable

Suivez ces étapes dans l'ordre exact pour une installation sans erreur.

## Étape 1 : Préparation des fichiers (Ici dans AI Studio)
Avant d'envoyer quoi que ce soit, assurez-vous que l'application est prête :
1. Dans le terminal AI Studio, lancez :
   ```bash
   npm run build
   ```
2. Cela va créer un dossier nommé `dist/`. C'est ce dossier qui contient tout votre site web compilé.

## Étape 2 : Téléchargement vers o2switch
1. Allez dans votre **cPanel o2switch** -> **Gestionnaire de fichiers**.
2. Allez dans `/home/zifu9583/public_html/Dhokkarrent` (ou votre dossier d'app).
3. **IMPORTANT** : Téléversez (Upload) ces fichiers à la racine du dossier :
   - `package.json`
   - `app.js` (Indispensable !)
   - `index.html`
   - Le dossier `src/`
   - Le dossier `public/`
   - **Le dossier `dist/` (celui que vous avez créé à l'étape 1)**

## Étape 3 : Configuration Node.js (cPanel)
1. Allez dans **Sélectionner une application Node.js**.
2. Créez ou modifiez l'application :
   - **Version Node.js** : 20.x
   - **Application root** : `public_html/Dhokkarrent`
   - **Application URL** : (votre domaine)
   - **Application startup file** : `app.js`
3. Cliquez sur **SAVE** puis sur **RESTART**.

## Étape 4 : Installation des dépendances (Terminal)
Si le bouton "npm install" du cPanel échoue, faites-le manuellement :
1. Ouvrez le **Terminal** cPanel.
2. Allez dans le dossier : `cd /home/zifu9583/public_html/Dhokkarrent`
3. Copiez-collez la ligne `source ...` donnée par le cPanel pour activer Node.
4. Tapez : `npm install --production`

## CORRECTION DES ERREURS

### Erreur "Non authentifié (401)"
J'ai synchronisé les clés de sécurité. Si vous voyez encore cette erreur :
1. Connectez-vous à nouveau sur votre site.
2. Si cela persiste, videz le cache de votre navigateur (Ctrl + F5).
3. **SOLUTION TECHNIQUE O2SWITCH** : Créez (ou modifiez) un fichier nommé `.htaccess` à la racine de votre dossier `Dhokkarrent` et ajoutez ces lignes EXACTEMENT :
   ```apache
   RewriteEngine On
   
   # Force la transmission de Authorization
   RewriteCond %{HTTP:Authorization} ^(.*)
   RewriteRule .* - [e=HTTP_AUTHORIZATION:%1]
   
   # Alternative pour X-Authorization
   RewriteCond %{HTTP:X-Authorization} ^(.*)
   RewriteRule .* - [e=HTTP_X_AUTHORIZATION:%1]
   
   # Optionnel : Désactivez le cache Apache pour l'API
   <FilesMatch "\.(php|js|json)$">
       FileETag None
       <ifModule mod_headers.c>
           Header unset ETag
           Header set Cache-Control "max-age=0, no-cache, no-store, must-revalidate"
           Header set Pragma "no-cache"
           Header set Expires "Wed, 11 Jan 1984 05:00:00 GMT"
       </ifModule>
   </FilesMatch>
   ```
   Cela force le serveur Apache à transmettre votre jeton de connexion à l'application Node.js. 
   **Note :** Si vous utilisez le panneau o2switch "App Manager", assurez-vous de bien redémarrer l'application après avoir modifié le fichier.

### Erreur "Could not resolve entry module index.html"
C'est parce que vous essayez de construire le projet sur o2switch sans avoir tous les fichiers. 
**Solution** : Suivez l'étape 1 ci-dessus et transférez le dossier `dist/` déjà prêt.

### Erreur 500
Souvent due au dossier `dist/` manquant. Assurez-vous que `dist/index.html` existe sur votre serveur.
