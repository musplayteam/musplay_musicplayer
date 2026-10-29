<div align="center">

# ⚡ MusPlay

### Your Music. Your Library. Your Player.
### Твоя музыка. Твоя библиотека. Твой плеер.

**A modern desktop music player for Windows, focused on local music, a clean interface, and synchronized lyrics.**

**Современный музыкальный плеер для Windows с упором на локальную музыку, удобный интерфейс и синхронизированные тексты песен.**

[English](#-english) · [Русский](#-русский)

</div>

---

# 🎵 English

## About

**MusPlay** is a desktop music player designed for listening to and managing a personal local music collection.

The project combines the familiar functionality of traditional music players with a modern interface, smooth animations, and convenient music library management.

The goal of MusPlay is to bring music playback, playlists, favorites, listening history, and lyrics into one application.

MusPlay is actively being developed, so its interface and features may change over time.

## ✨ Features

- 🎧 **Local music library** — play music files from your own collection.
- 🔎 **Library search** — quickly find tracks in your collection.
- 📂 **Playlists** — organize music your way.
- ❤️ **Favorites** — keep track of your favorite songs.
- 🕘 **Listening history** — revisit previously played tracks.
- 🎤 **Lyrics search** — search for synchronized lyrics using supported sources.
- ⏱️ **Synchronized lyrics** — follow song lines in time with playback when synchronized lyrics are available.
- 💾 **Local lyrics storage** — access saved lyrics without searching online again.
- 🎨 **Modern interface** — dark theme, vibrant accents, and smooth transitions.
- 🖥️ **Windows desktop app** — powered by Electron.

> Feature availability may vary depending on the current version of the application and the supported lyrics sources.

## 🛠️ Built With

| Technology | Purpose |
|---|---|
| React | User interface |
| Vite | Development server and build tool |
| Electron | Desktop application |
| JavaScript | Application logic |
| CSS | Styling and animations |
| Zustand | State management |
| LocalForage | Local data storage |
| music-metadata-browser | Audio metadata handling |
| Lucide React | Interface icons |

## 🚀 Installation and Setup

### Requirements

Install the following tools:

- [Node.js](https://nodejs.org/)
- [Git](https://git-scm.com/)

### 1. Clone the repository

```bash
git clone https://github.com/musplayteam/musplay_musicplayer.git
cd musplay_musicplayer
```

### 2. Install dependencies

```bash
npm ci
```

### 3. Start development mode

Start the Vite development server:

```bash
npm run dev
```

To launch the desktop application in development mode:

```bash
run file in powershell start-powershell.ps1
```

### 4. Build for Windows

```bash
npm run electron:build
```

The generated application packages should be placed in the `release` directory, according to the project's build configuration.

## 📁 Project Structure

```text
musplay_musicplayer/
├── public/             # Static assets
├── src/                # UI and application logic
├── electron.js         # Electron main process
├── preload.js          # Electron preload script
├── index.html          # HTML entry point
├── package.json        # Dependencies and scripts
├── package-lock.json   # Locked dependency versions
├── vite.config.js      # Vite configuration
└── README.md           # Project documentation
```

The actual structure may change as the project evolves.

## 🎯 Project Goals

MusPlay focuses on the following principles:

- **Simplicity** — straightforward music library management.
- **Personalization** — organize your collection the way you prefer.
- **Modern design** — a clean interface without unnecessary clutter.
- **Local-first listening** — focus on your own music rather than requiring a streaming subscription.
- **Convenience** — playback, playlists, favorites, history, and lyrics in one application.

## 🤝 Contributing and Feedback

Found a bug or have an idea for improvement? Open an Issue in the repository.

When reporting a bug, please include:

- MusPlay version.
- Windows version.
- Steps to reproduce the issue.
- Expected and actual behavior.

## 📄 License

A license has not yet been specified for this project. Usage and redistribution terms will be determined separately.

---

# 🇷🇺 Русский

## О проекте

**MusPlay** — настольный музыкальный плеер для воспроизведения и управления собственной локальной музыкальной коллекцией.

Проект объединяет привычные возможности классических музыкальных плееров с современным интерфейсом, плавными анимациями и удобной организацией музыки.

Цель MusPlay — собрать воспроизведение музыки, плейлисты, избранное, историю прослушивания и тексты песен в одном приложении.

Проект активно развивается, поэтому интерфейс и функциональность могут меняться.

## ✨ Возможности

- 🎧 **Локальная музыкальная библиотека** — воспроизведение аудиофайлов из собственной коллекции.
- 🔎 **Поиск по библиотеке** — быстрый поиск нужных композиций.
- 📂 **Плейлисты** — организация музыки по своим предпочтениям.
- ❤️ **Избранное** — сохранение любимых композиций.
- 🕘 **История прослушивания** — доступ к ранее воспроизводившимся трекам.
- 🎤 **Поиск текстов песен** — поиск синхронизированных текстов через поддерживаемые источники.
- ⏱️ **Синхронизированные тексты** — отображение строк в соответствии с воспроизведением, если доступен подходящий текст.
- 💾 **Локальное хранение текстов** — доступ к сохранённым текстам без повторного поиска в интернете.
- 🎨 **Современный интерфейс** — тёмная тема, яркие акценты и плавные переходы.
- 🖥️ **Приложение для Windows** — настольная версия на базе Electron.

> Доступность функций зависит от версии приложения и поддерживаемых источников текстов.

## 🛠️ Технологии

| Технология | Назначение |
|---|---|
| React | Пользовательский интерфейс |
| Vite | Сервер разработки и сборка |
| Electron | Настольное приложение |
| JavaScript | Логика приложения |
| CSS | Стили и анимации |
| Zustand | Управление состоянием |
| LocalForage | Локальное хранение данных |
| music-metadata-browser | Работа с метаданными аудиофайлов |
| Lucide React | Иконки интерфейса |

## 🚀 Установка и запуск

### Требования

Установи:

- [Node.js](https://nodejs.org/)
- [Git](https://git-scm.com/)

### 1. Клонирование репозитория

```bash
git clone https://github.com/musplayteam/musplay_musicplayer.git
cd musplay_musicplayer
```

### 2. Установка зависимостей

```bash
npm ci
```

### 3. Запуск в режиме разработки

Запуск интерфейса Vite:

```bash
npm run dev
```

Запуск настольного приложения:

```bash
npm run electron:dev
```

### 4. Сборка для Windows

```bash
npm run electron:build
```

Собранные версии приложения должны появиться в папке `release`, если это соответствует текущей конфигурации сборки.

## 📁 Структура проекта

```text
musplay_musicplayer/
├── public/             # Статические ресурсы
├── src/                # Интерфейс и логика приложения
├── electron.js         # Основной процесс Electron
├── preload.js          # Скрипт предварительной загрузки Electron
├── index.html          # HTML-точка входа
├── package.json        # Зависимости и команды
├── package-lock.json   # Зафиксированные версии зависимостей
├── vite.config.js      # Конфигурация Vite
└── README.md           # Документация проекта
```

Структура может меняться по мере развития проекта.

## 🎯 Цели проекта

MusPlay развивается вокруг нескольких принципов:

- **Простота** — удобное управление музыкальной библиотекой.
- **Персонализация** — организация коллекции по предпочтениям пользователя.
- **Современный дизайн** — аккуратный интерфейс без лишних элементов.
- **Локальное прослушивание** — акцент на собственной музыке без обязательной подписки на стриминговый сервис.
- **Удобство** — музыка, плейлисты, избранное, история и тексты в одном приложении.

## 🤝 Обратная связь

Нашёл ошибку или хочешь предложить улучшение? Создай Issue в репозитории.

При описании ошибки желательно указать:

- Версию MusPlay.
- Версию Windows.
- Шаги для воспроизведения.
- Ожидаемое и фактическое поведение.

## 📄 Лицензия

Лицензия проекта пока не указана. Условия использования и распространения будут определены отдельно.

---

<div align="center">

**MusPlay** ⚡

*Listen to your own music. / Слушай своё.*

</div>
