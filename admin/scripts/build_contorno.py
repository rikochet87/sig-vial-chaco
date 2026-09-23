#!/usr/bin/env python3
"""
Genera `src/data/contornoChaco.ts` — el límite provincial simplificado.

Sirve de molde para recortar los polígonos de Thiessen: sin él las zonas de los
pluviómetros del borde se estiran indefinidamente hacia Santiago, Salta y
Formosa, y el dibujo deja de parecer un mapa del Chaco.

La fuente es `public/geo/geo_bundle.json` (capa del IGN, 955 vértices). Se
simplifica con Douglas-Peucker a 0,8 km, que a escala provincial no se nota y
baja el archivo a un tercio. El recorte se hace una vez por estación contra
cada vértice, así que el tamaño del anillo se paga 70 veces.

    cd admin && python3 scripts/build_contorno.py
"""

import json
import math
import pathlib

TOLERANCIA_KM = 0.8
RAIZ = pathlib.Path(__file__).resolve().parent.parent


def douglas_peucker(pts, tol):
    if len(pts) < 3:
        return pts
    a, b = pts[0], pts[-1]
    dx, dy = b[0] - a[0], b[1] - a[1]
    largo = math.hypot(dx, dy) or 1e-9
    imax, dmax = 0, 0.0
    for i in range(1, len(pts) - 1):
        d = abs((pts[i][0] - a[0]) * dy - (pts[i][1] - a[1]) * dx) / largo
        if d > dmax:
            imax, dmax = i, d
    if dmax <= tol:
        return [a, b]
    return douglas_peucker(pts[: imax + 1], tol)[:-1] + douglas_peucker(pts[imax:], tol)


def main():
    bundle = json.loads((RAIZ / "public/geo/geo_bundle.json").read_text(encoding="utf-8"))
    anillo = bundle["limite_provincial"]["features"][0]["geometry"]["coordinates"][0][0]

    lat_media = sum(p[1] for p in anillo) / len(anillo)
    kx = 111.32 * math.cos(math.radians(lat_media))
    en_km = [(p[0] * kx, p[1] * 111.32) for p in anillo]

    # El anillo cierra sobre sí mismo, así que Douglas-Peucker recibiría los dos
    # extremos en el mismo punto y colapsaría todo a un segmento. Se parte en dos
    # mitades y se simplifica cada una.
    aro = en_km[:-1] if en_km[0] == en_km[-1] else en_km[:]
    m = len(aro) // 2
    simple = douglas_peucker(aro[: m + 1], TOLERANCIA_KM)[:-1] \
        + douglas_peucker(aro[m:] + [aro[0]], TOLERANCIA_KM)[:-1]

    pts = [(round(x / kx, 4), round(y / 111.32, 4)) for x, y in simple]

    cuerpo = "\n".join(
        "  " + ", ".join(f"[{lng}, {lat}]" for lng, lat in pts[i:i + 4]) + ","
        for i in range(0, len(pts), 4)
    )
    salida = f"""/**
 * Límite de la Provincia del Chaco, como anillo `[lng, lat]`.
 *
 * GENERADO — no editar a mano. Sale de `public/geo/geo_bundle.json` (IGN),
 * simplificado con Douglas-Peucker a {TOLERANCIA_KM} km:
 *
 *     cd admin && python3 scripts/build_contorno.py
 *
 * Se usa de molde para recortar los polígonos de Thiessen. Es sólo para dibujar:
 * ningún cálculo de lluvia depende de esta geometría.
 */

/** {len(pts)} vértices (el original del IGN tiene {len(anillo)}) */
export const CONTORNO_CHACO: [number, number][] = [
{cuerpo}
]
"""
    destino = RAIZ / "src/data/contornoChaco.ts"
    destino.write_text(salida, encoding="utf-8")
    print(f"{destino.relative_to(RAIZ)}: {len(anillo)} → {len(pts)} vértices")


if __name__ == "__main__":
    main()
