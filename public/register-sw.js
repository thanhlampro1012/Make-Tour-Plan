if("serviceWorker" in navigator && window.isSecureContext){
 window.addEventListener("load",()=>navigator.serviceWorker.register("/Make-Tour-Plan/sw.js",{scope:"/Make-Tour-Plan/"}).catch(()=>{}),{once:true});
}
