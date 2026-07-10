# Arquitectura General de ZenTicket

Este documento describe la arquitectura técnica de la plataforma, que conecta la interfaz de usuario en React, la base de datos Firestore y las automatizaciones del robot runner.

---

## 1. Estado Actual

ZenTicket opera con un backend en Express (`server.ts`) y un frontend SPA con React/Vite.
Las automatizaciones de portales externos residen en el directorio `runner/` y se coordinan mediante trabajos colocados en colas de Firestore (`invoice_jobs`).

---

## 2. Arquitectura Objetivo

La arquitectura objetivo sigue un modelo modular y desacoplado:

* **Frontend:** React + Vite, consumiendo APIs a través de `fetchWithAuth`.
* **Backend:** Express ordenado en rutas (`routes/`), controladores (`controllers/`) y repositorios (`repositories/`) para desacoplar el monolito.
* **Runner:** Motor independiente que consume colas de Firestore y realiza capturas/automatizaciones.

---

## 3. Riesgos Corregidos

* **Exposición de API:** Endpoints protegidos mediante Firebase Auth middleware.
* **Aislamiento de Firestore y Storage:** Reglas implementadas para evitar accesos y lecturas cruzadas.
* **Flujo Stripe-only:** Centralización en Stripe y Stripe Link, deshabilitando métodos secundarios.

---

## 4. Próximas Pautas de Implementación

* Evitar adición de endpoints en la raíz `server.ts`.
* Cada nueva ruta debe ir en `server/routes/` y estar debidamente autenticada.
