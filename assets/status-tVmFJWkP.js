import{c as d,d as w,C as z,e as s,g as o,h as e,i as c,j as p,l as _,k as f,R as A,n as x,_ as S,t as r,x as y,T as k,B as b,F as B,s as I,q as D,r as h,U as q,O as L}from"./style-ghkhmKvn.js";/**
 * @license lucide-vue-next v0.468.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const N=d("ArrowLeftIcon",[["path",{d:"m12 19-7-7 7-7",key:"1l729n"}],["path",{d:"M19 12H5",key:"x3x0zl"}]]);/**
 * @license lucide-vue-next v0.468.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const V=d("CircleAlertIcon",[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["line",{x1:"12",x2:"12",y1:"8",y2:"12",key:"1pkeuh"}],["line",{x1:"12",x2:"12.01",y1:"16",y2:"16",key:"4dfq90"}]]);/**
 * @license lucide-vue-next v0.468.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const j=d("CircleCheckIcon",[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["path",{d:"m9 12 2 2 4-4",key:"dzmm74"}]]);/**
 * @license lucide-vue-next v0.468.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const R=d("CircleXIcon",[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["path",{d:"m15 9-6 6",key:"1uzhvr"}],["path",{d:"m9 9 6 6",key:"z0biqf"}]]),T={class:"mx-auto min-h-dvh max-w-2xl p-4 safe-top safe-bottom"},E=["href"],F={class:"flex items-start justify-between gap-4"},G={key:0,class:"mt-6 rounded-xl bg-destructive p-4 text-white"},M={key:1,class:"mt-8 grid gap-3"},O={class:"text-xl font-bold capitalize"},P={class:"font-semibold capitalize"},X={class:"flex items-center gap-2 text-sm capitalize"},$=w({__name:"StatusApp",setup(H){const a=h(null),n=h(""),i=h(!1),C="/pm-hybrid-graden/";async function g(){i.value=!0,n.value="";try{a.value=await q()}catch(l){n.value=l instanceof Error?l.message:"Status unavailable"}finally{i.value=!1}}const v=l=>l==="healthy"?j:l==="degraded"?V:R;return z(g),(l,t)=>(s(),o("main",T,[e("a",{href:p(C),class:"mb-6 inline-flex items-center gap-2 text-sm font-semibold"},[c(p(N),{class:"size-4"}),t[0]||(t[0]=_(" Collection",-1))],8,E),e("div",F,[t[1]||(t[1]=e("div",null,[e("p",{class:"text-sm font-semibold uppercase tracking-wide text-muted-foreground"},"Public health check"),e("h1",{class:"text-3xl font-bold"},"System Status")],-1)),c(S,{variant:"outline",size:"icon","aria-label":"Refresh",disabled:i.value,onClick:g},{default:f(()=>[c(p(A),{class:x(i.value&&"animate-spin")},null,8,["class"])]),_:1},8,["disabled"])]),t[3]||(t[3]=e("p",{class:"mt-2 text-muted-foreground"},"This page tests the API, a lightweight Supabase query, and access to the private Google Drive folder without exposing configuration details.",-1)),n.value?(s(),o("p",G,r(n.value),1)):a.value?(s(),o("div",M,[c(b,{class:"flex items-center gap-3 p-4"},{default:f(()=>[(s(),y(k(v(a.value.status)),{class:x(["size-7",a.value.status==="healthy"?"text-primary":"text-destructive"])},null,8,["class"])),e("div",null,[t[2]||(t[2]=e("p",{class:"text-sm text-muted-foreground"},"Overall",-1)),e("p",O,r(a.value.status),1)])]),_:1}),(s(!0),o(B,null,I(a.value.services,(u,m)=>(s(),y(b,{key:m,class:"flex items-center justify-between p-4"},{default:f(()=>[e("span",P,r(m==="googleDrive"?"Google Drive":m),1),e("span",X,[(s(),y(k(v(u)),{class:x(["size-5",u==="healthy"?"text-primary":"text-destructive"])},null,8,["class"])),_(r(u),1)])]),_:2},1024))),128))])):D("",!0)]))}});L($).mount("#app");
