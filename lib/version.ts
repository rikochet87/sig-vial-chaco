/**
 * La versión de la app instalada, para mostrarla en pantalla.
 *
 * Existe porque el APK se reparte a mano y no hay tienda que diga qué tiene
 * cada teléfono. Cuando la app se cerraba en campo no hubo forma de saber qué
 * build tenía cada técnico — ni siquiera con el informe de errores del
 * teléfono. Ahora se le puede preguntar: está al pie de Inicio y del login.
 *
 * Sale de `app.json` tal como quedó dentro del APK. **El número entre
 * paréntesis es `android.versionCode` y hay que subirlo en cada build que se
 * reparte**: es lo único que distingue dos APK con el mismo `version`.
 */
import Constants from 'expo-constants';

const cfg = Constants.expoConfig;

export const VERSION_APP = `v${cfg?.version ?? '?'} (${cfg?.android?.versionCode ?? '?'})`;
