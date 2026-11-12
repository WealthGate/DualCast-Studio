import { RefObject, useEffect, useState } from "react";
import type { VideoResolution } from "../../shared/types";
import { onCanvasFrame } from "../utils/canvasFrames";
import { createProgramVideoEncoder } from "../utils/programVideoEncoder";

export const useEncodedProjection = (canvasRef:RefObject<HTMLCanvasElement>,fps:number,enabled:boolean,resolution?:VideoResolution)=>{
 const [ready,setReady]=useState(false),[fallback,setFallback]=useState(false);
 useEffect(()=>{
  const canvas=canvasRef.current;
  if(!enabled||!canvas){setReady(false);return;}
  setFallback(false);
  if(typeof VideoEncoder==="undefined"||!window.dualcast.sendProgramVideoFrame){setFallback(true);return;}
  let active=true,encoder:Awaited<ReturnType<typeof createProgramVideoEncoder>>|null=null,starting=false;
  const peers=new Set<number>();let offFrames=()=>{};
  const fail=()=>{if(active){setReady(false);setFallback(true);offFrames();offFrames=()=>{};encoder?.stop();encoder=null;}};
  const start=async()=>{
   if(starting||encoder||!peers.size)return;starting=true;
   try{
    const current=await createProgramVideoEncoder(canvas,fps,resolution,frame=>{if(active&&peers.size){window.dualcast.sendProgramVideoFrame(frame);setReady(true);}},fail);
    if(!active||!peers.size){current.stop();return;}
    encoder=current;offFrames=onCanvasFrame(canvas,now=>{if(peers.size)current.draw(now);},fps);current.draw(performance.now());
   }catch{fail();}finally{starting=false;}
  };
  const off=window.dualcast.onProjectionSignal(signal=>{
   if(signal.type==="fallback"){fail();return;}
   if(!signal.peerId)return;
   if(signal.type==="closed"){peers.delete(signal.peerId);if(!peers.size){setReady(false);offFrames();offFrames=()=>{};encoder?.stop();encoder=null;}}
   if(signal.type==="ready"){peers.add(signal.peerId);encoder?.requestKeyFrame();void start();}
  });
  window.dualcast.sendProjectionSignal({type:"register"});
  return()=>{active=false;off();offFrames();encoder?.stop();setReady(false);};
 },[canvasRef,fps,enabled,resolution]);
 return {ready,fallback};
};
