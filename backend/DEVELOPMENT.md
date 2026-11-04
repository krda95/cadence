# Cadence — Development Guide

## Wymagania

- Python 3.13+
- PostgreSQL / Supabase
- aktywne środowisko `.venv`

Sprawdzenie wersji Pythona:

```bash
python3.13 --version
```

---

## Virtual environment


### Aktywacja środowiska

W katalogu backend uruchom

```bash
source .venv/bin/activate
```

### Sprawdzenie aktywnego interpretera

```bash
which python
python --version
```

### Wyjście ze środowiska .venv

```bash
deactivate
```

### Utworzenie środowiska od nowa

> **Uwaga:** usuwa obecne środowisko i pakiety zainstalowane w `.venv`.

```bash
cd /Users/xyz/Documents/Projects/cadence
deactivate
rm -rf .venv
python3.13 -m venv .venv
source .venv/bin/activate
python -m ensurepip --upgrade
python -m pip install --upgrade pip
```

---

## Instalacja zależności

Instalacja zależności aplikacji:

```bash
python -m pip install -r requirements.txt
```

Instalacja zależności developerskich i testowych:

```bash
python -m pip install -r requirements-dev.txt
```

Lista zainstalowanych pakietów:

```bash
python -m pip list
```

---

## Zarządzanie zależnościami

W projekcie Cadence wykorzystujemy `uv` do zarządzania zależnościami Pythona.

Źródłem prawdy są:
- `pyproject.toml` — deklaracja zależności projektu.
- `uv.lock` — zablokowane wersje zależności.
- `requirements.txt` — zależności produkcyjne wykorzystywane m.in. przez Dockera.
- `requirements-dev.txt` — zależności developerskie i testowe.

### Dodawanie nowych zależności

Nowe zależności dodajemy za pomocą:

```bash
uv add nazwa-pakietu
```

Następnie aktualizujemy `requirements.txt`:

```bash
uv export --no-dev --no-hashes --format requirements-txt -o requirements.txt
```

Nie używamy `pip freeze > requirements.txt`, ponieważ może to spowodować zapisanie niepotrzebnych pakietów z lokalnego środowiska.

### Weryfikacja zmian

Po aktualizacji zależności:

```bash
python -m pytest tests --ignore=tests/integration
git diff pyproject.toml uv.lock requirements.txt
```

Sprawdzamy, czy:
- wszystkie testy przechodzą,
- nowe zależności znajdują się w odpowiednich plikach,
- nie pojawiły się nieoczekiwane aktualizacje innych pakietów.

---

## Docker — kontrola po zmianach w backendzie

Docker wykorzystuje własne środowisko Pythona i instaluje zależności niezależnie od lokalnego `.venv`.

Dlatego każda zmiana zależności, wersji Pythona lub sposobu uruchamiania backendu wymaga sprawdzenia kompatybilności z Dockerem.

### Checklist

Po zmianach w backendzie sprawdzamy:

1. Czy `requirements.txt` zawiera wszystkie nowe zależności produkcyjne?
2. Czy `Dockerfile` instaluje zależności z aktualnego pliku?
3. Czy wersja Pythona w Dockerze jest zgodna z wymaganiami projektu?
4. Czy nowe zależności działają w środowisku Linux?
5. Czy backend uruchamia się poprawnie po przebudowaniu obrazu?

### Przebudowanie obrazu

Z katalogu zawierającego `compose.yaml` lub `docker-compose.yml`:

```bash
docker compose build backend
```

Uruchomienie:

```bash
docker compose up -d backend
```

Sprawdzenie logów:

```bash
docker compose logs --tail=100 backend
```

### Ważne

Nie każda zmiana zależności wymaga modyfikacji `Dockerfile`.

Jeżeli Docker instaluje pakiety z `requirements.txt`, aktualizacja tego pliku i przebudowanie obrazu powinny wystarczyć.

Zmiana wersji Pythona, bibliotek systemowych lub sposobu instalowania zależności może jednak wymagać aktualizacji samego `Dockerfile`.

**Zasada projektu:** przed zakończeniem zmian dotyczących zależności backendu zawsze sprawdzamy ich wpływ na środowisko Docker.


## Migracje Alembic


### Sprawdzenie bieżącej migracji

```bash
alembic current
```

### Historia migracji

```bash
alembic history
```

### Automatyczne wygenerowanie migracji

```bash
alembic revision --autogenerate -m "opis_zmiany"
```

### Ręczne utworzenie pustej migracji

```bash
alembic revision -m "opis_zmiany"
```

### Wykonanie wszystkich migracji

```bash
alembic upgrade head
```

### Cofnięcie jednej migracji

```bash
alembic downgrade -1
```

---

## Testy

### Wszystkie testy

```bash
python -m pytest -v
```

### Unit Testy

```bash
python -m pytest tests/test_progress_rules.py -v
```

### Jeden konkretny test

```bash
python -m pytest \
  tests/test_progress_rules.py::test_daily_max_limit_exceeded_gives_zero_points \
  -v
```

### Wszystkie testy integracyjne

```bash
python -m pytest -m integration -v
```

### Jeden test integracyjny np. daily progress

```bash
python -m pytest \
  tests/integration/test_daily_progress_api.py \
  -m integration \
  -v
```

### Tylko unit testy, bez integracyjnych

```bash
python -m pytest -m "not integration" -v
```

---

## Unit Testy progresu — co sprawdzamy

Unit testy w:

```
backend/tests/test_progress_rules.py
```

sprawdzają zasady biznesowe bez uruchamiania API i bazy:

- `min`: wynik proporcjonalny, maksymalnie 100%
- `max`: 100% w limicie, 0% po przekroczeniu
- brak wpisu dla zakończonego daily min: 0%
- brak wpisu dla zakończonego daily max: 100%
- brak wpisu dla dzisiejszego daily min: pending
- kara za weekly/monthly max tylko w dniu, w którym wpis przekracza limit
- brak kolejnej kary w następnych dniach bez nowego wpisu

Test integracyjny sprawdza pełny przepływ:

```
HTTP request
→ FastAPI
→ JWT / current user
→ PostgreSQL
→ progress service
→ progress rules
→ JSON response
```

---

## Zmienne środowiskowe dla testów integracyjnych

Test integracyjny potrzebuje działającego backendu oraz tokenu użytkownika testowego.

### Token

```bash
export CADENCE_TEST_TOKEN='TU_WKLEJ_ACCESS_TOKEN'
```

### Prefix endpointów goals

```bash
export CADENCE_GOALS_PATH='/api/v1/goals'
```

### Sprawdzenie ustawionych wartości

```bash
echo $CADENCE_TEST_TOKEN
echo $CADENCE_GOALS_PATH
```

### Usunięcie tokenu z bieżącego terminala

```bash
unset CADENCE_TEST_TOKEN
```


## Codzienny workflow

```bash
cd backend
source .venv/bin/activate
python -m pytest tests/test_progress_rules.py -v #unit testy
python -m uvicorn app.main:app --reload # old-school, wymaga .venv
uv run fastapi dev app/main.py # nowsza metoda
```

### Lokalnie vs. z telefonu (to samo Wi-Fi)

Frontend woła API pod tym samym hostem, z którego otwarto stronę, więc nie trzeba nic przestawiać.

| Tryb | Backend | Frontend | Adres |
|------|---------|----------|-------|
| Lokalnie | `uv run fastapi dev app/main.py` | `npm start` | `http://localhost:4200` |
| Telefon | `uv run fastapi dev app/main.py --host 0.0.0.0` | `npm run start:mobile` | `http://<IP-maca>:4200` |

IP Maca: `ipconfig getifaddr en0`. CORS w trybie `development` przepuszcza `localhost` oraz adresy sieci
prywatnych (192.168.x.x, 10.x.x.x, 172.16-31.x.x) na porcie 4200.

---

## Zasada

Preferuj uruchamianie narzędzi przez:

```bash
python -m pip ...
python -m pytest ...
python -m uvicorn ...
```

Dzięki temu `pip`, `pytest` i FastAPI zawsze używają tego samego interpretera Python oraz tego samego virtualenv.