/**
 * An SVG already on screen, turned into something a canvas can draw.
 *
 * The share card is drawn rather than screenshotted (see `lib/shareCard.ts`),
 * which leaves one thing it cannot draw: the ball. That picture is real 3D
 * geometry projected by `lib/ballProjection`, and a second copy of it in canvas
 * calls would be the same drawing maintained twice and drifting quietly. So the
 * SVG the screen is already showing is serialized and rasterized instead: one
 * drawing, two destinations.
 *
 * The serialized markup must stand alone, because an `<img>` renders it in an
 * isolated document: no stylesheet, no CSS variables, no external fonts. The
 * ball diagram qualifies already (its colours and its gradients are all inline
 * attributes), which is why this is a plain serializer rather than a style
 * inliner, and why anything else that wants it has to meet the same bar.
 */
export function svgToImage(svg: SVGSVGElement, size: number): Promise<HTMLImageElement> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  // An `<img>` sizes the SVG by its own width and height, and the diagram
  // carries neither: it is sized by the layout around it.
  clone.setAttribute("width", String(size));
  clone.setAttribute("height", String(size));

  const markup = new XMLSerializer().serializeToString(clone);
  // A data URL rather than a blob URL: a blob URL has to be revoked, and the
  // one thing worse than a leaked object URL is one revoked while the image
  // that needs it is still decoding.
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;

  return new Promise((resolve, reject) => {
    const img = new Image();
    const fail = () => reject(new Error("The picture of the ball could not be drawn."));
    img.onload = () => resolve(img);
    img.onerror = fail;
    // An environment that neither loads nor refuses the image (jsdom, and any
    // browser that quietly drops a decode) would otherwise leave this pending
    // forever, and with it whatever is waiting on the picture.
    setTimeout(fail, 5000);
    img.src = url;
  });
}
