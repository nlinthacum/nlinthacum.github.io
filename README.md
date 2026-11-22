# Nick Linthacum

Personal homepage, published with GitHub Pages at [nlinthacum.github.io](https://nlinthacum.github.io/). It is plain HTML, CSS, and JavaScript, with no build step.

## Add a game

1. Put a thumbnail in `assets/`. A compressed PNG around 1280×720 is a good size.
2. Open `index.html` and add an object to the `GAMES` array:

```js
{
  title: "My Game",
  blurb: "A sentence or two about how it plays.",
  href: "https://nlinthacum.github.io/my-game/",
  image: "assets/my-game.png",
  alt: "Short description of the thumbnail.",
  status: "play"
}
```

Use a root-relative path such as `/my-game/`, or a full `https://…` URL. A coming-soon card only needs `title`, `blurb`, and `status: "soon"`. Optional `motif` is `"maze"`, `"word"`, or `"spark"`.

3. Push to `main`.

## Domain

Do not add a `CNAME` file until nicklinthacum.com is ready to switch. When it does, update the canonical URL and `og:url` in `index.html`.
