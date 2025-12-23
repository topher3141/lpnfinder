"use client";
import {useState,useRef} from "react";

function normalize(v){return (v||"").trim().toUpperCase();}
export default function AppShell(){
  const [lpn,setLpn]=useState("");
  const [rec,setRec]=useState(null);
  const input=useRef(null);

  async function search(){
    const key=normalize(lpn);
    if(!key) return;
    const shard=key.slice(0,2)||"ZZ";
    const res=await fetch(`/index/shards/${shard}.json`);
    if(!res.ok){setRec(null);return;}
    const data=await res.json();
    setRec(data.index[key]||null);
  }

  return (
    <div style={{padding:20}}>
      <h1>LPN Finder</h1>
      <input ref={input} value={lpn} onChange={e=>setLpn(e.target.value)}
        onKeyDown={e=>e.key==="Enter"&&search()}
        placeholder="Scan / Type LPN" style={{fontSize:24,width:"100%"}}/>
      <button onClick={search}>Search</button>
      {rec&&(
        <pre style={{marginTop:20,background:"#111",padding:10}}>
          {JSON.stringify(rec,null,2)}
        </pre>
      )}
    </div>
  );
}
