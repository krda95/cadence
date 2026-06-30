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

Aktualizacja `requirements.txt` po instalacji nowych pakietów:

```bash
python -m pip freeze > requirements.txt
```


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

### Prefix endpointów challenge

```bash
export CADENCE_CHALLENGES_PATH='/api/v1/challenges'
```

### Sprawdzenie ustawionych wartości

```bash
echo $CADENCE_TEST_TOKEN
echo $CADENCE_CHALLENGES_PATH
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

---

## Zasada

Preferuj uruchamianie narzędzi przez:

```bash
python -m pip ...
python -m pytest ...
python -m uvicorn ...
```

Dzięki temu `pip`, `pytest` i FastAPI zawsze używają tego samego interpretera Python oraz tego samego virtualenv.