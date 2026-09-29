// Serves site/dist at https://theaipipe.com/fitness-delivery-check/ (route theaipipe.com/fitness-delivery-check*).
// Static files only; nothing here calls a model, a store or a database.
export default {
  async fetch(request, env) {
    const res = await env.ASSETS.fetch(request);
    const out = new Response(res.body, res);
    out.headers.set("X-Robots-Tag", "noindex, nofollow");
    return out;
  },
};
