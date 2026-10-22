import { useEffect, useState } from "react";
export const supports8KEncoding = async (fps: number) => {
  if(typeof VideoEncoder==="undefined")return false;
  try{return (await VideoEncoder.isConfigSupported({codec:"av01.0.17M.08",width:7680,height:4320,framerate:fps,bitrate:80_000_000,latencyMode:"realtime",hardwareAcceleration:"prefer-hardware"})).supported===true;}catch{return false;}
};
export const use8KSupport = (fps:number) => {
  const [supported,setSupported]=useState<boolean|null>(null);
  useEffect(()=>{let active=true;setSupported(null);void supports8KEncoding(fps).then(value=>{if(active)setSupported(value);});return()=>{active=false;};},[fps]);
  return supported;
};
