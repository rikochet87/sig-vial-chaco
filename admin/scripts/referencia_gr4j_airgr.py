"""
Genera la referencia contra la que se compara `src/lib/gr4j.ts`:

    scripts/gr4j-airgr-referencia.json

con el núcleo Fortran de `airGR` (INRAE), que es la implementación de
referencia de GR4J, a través del paquete de Python `hydrogr`, que lo envuelve
sin tocarlo.

    pip install --target /tmp/refgr hydrogr
    PYTHONPATH=/tmp/refgr python3 scripts/referencia_gr4j_airgr.py

No hace falta correrlo de nuevo salvo que se cambien las series o los
parámetros de abajo: el archivo que genera va en el repo, y
`verificar-crecida.ts` lo lee sin Python.

Las series de lluvia y evapotranspiración no son datos reales: salen de un
generador congruencial con semilla fija, el mismo que escribe acá, y se
guardan en el archivo. Lo que importa es que las dos implementaciones reciban
exactamente los mismos números. Tienen días secos, tormentas de 120 mm y
rachas largas sin lluvia, para pasar por todas las ramas del modelo: suelo
que se vacía, intercambio negativo que vacía el tránsito, x4 corto y largo.
"""
import json
import os

import numpy as np
from hydrogr._hydrogr import gr4j

N = 1500


def serie(semilla):
    # Congruencial de Numerical Recipes, en enteros de 32 bits
    a, c, m = 1664525, 1013904223, 2**32
    x = semilla
    out = []
    for _ in range(N):
        x = (a * x + c) % m
        out.append(x / m)
    return out


u1, u2, u3 = serie(1), serie(2), serie(3)
lluvia = []
etp = []
for t in range(N):
    estacion = 0.5 + 0.5 * np.cos(2 * np.pi * t / 365.25)
    llueve = u1[t] < 0.25 + 0.2 * estacion
    mm = (-np.log(1 - u2[t]) * (8 + 14 * estacion)) if llueve else 0.0
    if 400 <= t < 470:
        mm = 0.0  # sequía larga
    if t in (200, 201, 900):
        mm = 120.0  # tormentas
    lluvia.append(round(float(mm), 3))
    etp.append(round(float(2 + 3 * (1 - estacion) + u3[t] * 0.8), 3))

CASOS = [
    {"nombre": "manual airGR", "x1": 257.24, "x2": 1.012, "x3": 88.23, "x4": 2.208},
    {"nombre": "suelo chico, ganancia", "x1": 55.6, "x2": 1.36, "x3": 419.4, "x4": 2.44},
    {"nombre": "suelo grande, x4 largo", "x1": 1925.5, "x2": 2.0, "x3": 102.8, "x4": 9.7},
    {"nombre": "pérdida fuerte", "x1": 350.0, "x2": -4.5, "x3": 60.0, "x4": 1.3},
]

P = np.array(lluvia, dtype=float)
E = np.array(etp, dtype=float)
salida = {
    "fuente": "airGR (INRAE), núcleo Fortran de GR4J vía el paquete hydrogr",
    "nota": "estado inicial: suelo al 30 % de x1, tránsito al 50 % de x3, hidrogramas vacíos",
    "lluvia": lluvia,
    "etp": etp,
    "casos": [],
}
for c in CASOS:
    x = [c["x1"], c["x2"], c["x3"], c["x4"]]
    estados = np.array([0.3 * c["x1"], 0.5 * c["x3"]], dtype=float)
    uh1 = np.zeros(20, dtype=float)
    uh2 = np.zeros(40, dtype=float)
    estados, uh1, uh2, q = gr4j(x, P, E, estados, uh1, uh2)
    salida["casos"].append({**c, "q": [float(v) for v in q], "sFinal": float(estados[0]), "rFinal": float(estados[1])})

destino = os.path.join(os.path.dirname(__file__), "gr4j-airgr-referencia.json")
with open(destino, "w", encoding="utf-8") as f:
    json.dump(salida, f, ensure_ascii=False, separators=(",", ":"))
print("escrito", destino)
