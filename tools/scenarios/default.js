export default async function (page, ctx) {
  await ctx.wait(2500);
  await ctx.shot('01');
}
