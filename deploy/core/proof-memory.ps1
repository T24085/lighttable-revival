$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class RevivalJob {
 [StructLayout(LayoutKind.Sequential)] public struct Basic {
  public long ProcessTime,JobTime;public uint Flags;public UIntPtr MinimumWorkingSet,MaximumWorkingSet;public uint ActiveProcesses;public UIntPtr Affinity;public uint Priority,Scheduling;
 }
 [StructLayout(LayoutKind.Sequential)] public struct IO {public ulong ReadOps,WriteOps,OtherOps,ReadBytes,WriteBytes,OtherBytes;}
 [StructLayout(LayoutKind.Sequential)] public struct Extended {public Basic Basic;public IO IO;public UIntPtr ProcessMemory,JobMemory,PeakProcessMemory,PeakJobMemory;}
 [DllImport("kernel32.dll",SetLastError=true,CharSet=CharSet.Unicode)] public static extern IntPtr CreateJobObject(IntPtr attributes,string name);
 [DllImport("kernel32.dll",SetLastError=true)] public static extern bool SetInformationJobObject(IntPtr job,int kind,ref Extended info,uint size);
 [DllImport("kernel32.dll",SetLastError=true)] public static extern bool QueryInformationJobObject(IntPtr job,int kind,out Extended info,uint size,IntPtr returned);
 [DllImport("kernel32.dll",SetLastError=true)] public static extern IntPtr OpenProcess(uint access,bool inherit,uint pid);
 [DllImport("kernel32.dll",SetLastError=true,CharSet=CharSet.Unicode)] public static extern bool QueryFullProcessImageName(IntPtr process,uint flags,StringBuilder name,ref uint size);
 [DllImport("kernel32.dll",SetLastError=true)] public static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
 [DllImport("kernel32.dll",SetLastError=true)] public static extern bool IsProcessInJob(IntPtr process,IntPtr job,out bool included);
 [DllImport("iphlpapi.dll")] public static extern uint GetExtendedTcpTable(IntPtr table,ref uint size,bool order,uint family,int kind,uint reserved);
 [DllImport("kernel32.dll",SetLastError=true)] public static extern bool CloseHandle(IntPtr handle);
 public static Extended Limits(){Extended info=new Extended();info.Basic.Flags=0x2300;info.ProcessMemory=new UIntPtr(1024UL*1024*1024);info.JobMemory=new UIntPtr(1024UL*1024*1024);return info;}
 [DllImport("kernel32.dll",SetLastError=true)] public static extern uint WaitForSingleObject(IntPtr handle,uint milliseconds);
 public static int LastError(){return Marshal.GetLastWin32Error();}
 public static uint Size(){return (uint)Marshal.SizeOf(typeof(Extended));}
 static uint Port(IntPtr row,int offset){uint raw=(uint)Marshal.ReadInt32(row,offset);return ((raw&255)<<8)|((raw>>8)&255);}
 static bool Loopback6(IntPtr row,int offset,bool ipv4){
  for(int index=0;index<10;index++)if(Marshal.ReadByte(row,offset+index)!=0)return false;
  if(ipv4)return Marshal.ReadByte(row,offset+10)==255&&Marshal.ReadByte(row,offset+11)==255&&Marshal.ReadByte(row,offset+12)==127&&Marshal.ReadByte(row,offset+13)==0&&Marshal.ReadByte(row,offset+14)==0&&Marshal.ReadByte(row,offset+15)==1;
  for(int index=10;index<15;index++)if(Marshal.ReadByte(row,offset+index)!=0)return false;return Marshal.ReadByte(row,offset+15)==1;
 }
 public static uint Peer(IntPtr job,bool ipv4,uint serverPort,uint clientPort){
  foreach(uint family in new uint[]{2,23}){
   if(!ipv4&&family==2)continue;uint size=0;uint result=GetExtendedTcpTable(IntPtr.Zero,ref size,false,family,5,0);
   if(result!=122&&result!=0)throw new Exception("TCP table size query failed: "+result);
   for(int attempt=0;attempt<3;attempt++){
    IntPtr table=Marshal.AllocHGlobal((int)size);try{
     result=GetExtendedTcpTable(table,ref size,false,family,5,0);if(result==122)continue;if(result!=0)throw new Exception("TCP table query failed: "+result);
     int stride=family==2?24:56,count=Marshal.ReadInt32(table);if(count<0||(long)count*stride+4>size)throw new Exception("Invalid TCP table size");
     for(int index=0;index<count;index++){
      IntPtr row=IntPtr.Add(table,4+index*stride);int state=Marshal.ReadInt32(row,family==2?0:48);
      if(state!=5||Port(row,family==2?8:20)!=serverPort||Port(row,family==2?16:44)!=clientPort)continue;
      bool loopback=family==2?(uint)Marshal.ReadInt32(row,4)==0x0100007f&&(uint)Marshal.ReadInt32(row,12)==0x0100007f:Loopback6(row,0,ipv4)&&Loopback6(row,24,ipv4);if(!loopback)continue;
      uint pid=(uint)Marshal.ReadInt32(row,family==2?20:52);IntPtr process=OpenProcess(0x1000,false,pid);if(process==IntPtr.Zero)throw new Exception("TCP peer process query failed: "+LastError());
      try{bool included;if(!IsProcessInJob(process,job,out included))throw new Exception("TCP peer job query failed: "+LastError());if(!included)throw new Exception("TCP endpoint is outside the active npm process family");return pid;}finally{CloseHandle(process);}
     }break;
    }finally{Marshal.FreeHGlobal(table);}
   }
  }throw new Exception("The established npm TCP peer was not found");
 }
}
"@
$jobs=@{}
[Console]::Out.WriteLine('{"ready":true}')
try {
while($null-ne ($line=[Console]::In.ReadLine())) {
 $request=$null
 try {
  $request=$line|ConvertFrom-Json
  if($request.id-notmatch '^[a-f0-9]{32}$'){throw 'Invalid job identifier'}
  if($request.op-eq 'attach') {
   if($jobs.ContainsKey($request.id)){throw 'Job already exists'}
   $requestedLimit=$request.limitBytes
   if(($requestedLimit-isnot [int]-and $requestedLimit-isnot [long]-and $requestedLimit-isnot [double])-or $requestedLimit-notin @(192MB,384MB,512MB,1GB,2GB)){throw 'Memory quota must be 192, 384, 512, 1024 or 2048 MiB'}
   $limit=[long]$requestedLimit
   $target=[uint32]$request.pid
   if(!$target-or $target-eq $PID){throw 'Invalid target'}
   $process=[Diagnostics.Process]::GetProcessById($target)
   $baseline=$process.PrivateMemorySize64
   if($baseline-ge $limit){throw 'Renderer baseline already exceeds private-commit budget'}
   $job=[RevivalJob]::CreateJobObject([IntPtr]::Zero,$null)
   if($job-eq [IntPtr]::Zero){throw ('CreateJobObject failed: '+[RevivalJob]::LastError())}
   $handle=[IntPtr]::Zero
   try {
    $info=[RevivalJob]::Limits()
    # Limits initialized by C# to preserve nested struct fields
    $info.ProcessMemory=[UIntPtr]::new([uint64]$limit)
    $info.JobMemory=[UIntPtr]::new([uint64]$limit)
    if(![RevivalJob]::SetInformationJobObject($job,9,[ref]$info,[RevivalJob]::Size())){throw ('SetInformationJobObject failed: '+[RevivalJob]::LastError())}
    $handle=[RevivalJob]::OpenProcess(0x101101,$false,$target)
    if($handle-eq [IntPtr]::Zero){throw ('OpenProcess quota rights failed: '+[RevivalJob]::LastError())}
    # Query the executable through the held process handle. MainModule can be
    # empty while a newly spawned process is still initializing its loader.
    $image=[Text.StringBuilder]::new(32768);$imageSize=[uint32]32768
    if(![RevivalJob]::QueryFullProcessImageName($handle,0,$image,[ref]$imageSize)){throw ('Process image query failed: '+[RevivalJob]::LastError())}
    if(![string]::Equals($image.ToString(),[string]$request.executable,[StringComparison]::OrdinalIgnoreCase)){throw 'Target executable mismatch'}
    if(![RevivalJob]::AssignProcessToJobObject($job,$handle)){throw ('AssignProcessToJobObject failed: '+[RevivalJob]::LastError())}
    $verified=New-Object RevivalJob+Extended
    if(![RevivalJob]::QueryInformationJobObject($job,9,[ref]$verified,[RevivalJob]::Size(),[IntPtr]::Zero)){throw 'Quota readback failed'}
    if($verified.ProcessMemory.ToUInt64()-ne $limit-or $verified.JobMemory.ToUInt64()-ne $limit-or ($verified.Basic.Flags-band 0x2300)-ne 0x2300){throw 'Quota readback mismatch'}
    $jobs[$request.id]=@{Job=$job;Process=$handle};$handle=[IntPtr]::Zero
    [Console]::Out.WriteLine((@{id=$request.id;ok=$true;pid=$target;limitBytes=$limit;baselinePrivateBytes=$baseline;flags=$verified.Basic.Flags;hardPrivateCommit=$true}|ConvertTo-Json -Compress))
    $job=[IntPtr]::Zero
   } finally {if($handle-ne [IntPtr]::Zero){[RevivalJob]::CloseHandle($handle)|Out-Null};if($job-ne [IntPtr]::Zero){[RevivalJob]::CloseHandle($job)|Out-Null}}
  } elseif($request.op-eq 'peer') {
   if($request.job-notmatch '^[a-f0-9]{32}$'-or !$jobs.ContainsKey($request.job)){throw 'Unknown peer job'}
   if($request.address-notin @('127.0.0.1','::1')-or $request.serverPort-lt 1-or $request.serverPort-gt 65535-or $request.clientPort-lt 1-or $request.clientPort-gt 65535){throw 'Invalid loopback peer'}
   $owner=[RevivalJob]::Peer($jobs[$request.job].Job,($request.address-eq '127.0.0.1'),[uint32]$request.serverPort,[uint32]$request.clientPort)
   [Console]::Out.WriteLine((@{id=$request.id;ok=$true;pid=$owner;job=$request.job;owned=$true}|ConvertTo-Json -Compress))
  } elseif($request.op-eq 'release') {
   if(!$jobs.ContainsKey($request.id)){throw 'Unknown job'}
   $entry=$jobs[$request.id];$job=$entry.Job;$info=[RevivalJob]::Limits()
   if(![RevivalJob]::QueryInformationJobObject($job,9,[ref]$info,[RevivalJob]::Size(),[IntPtr]::Zero)){throw 'Quota accounting readback failed'}
   $closed=[RevivalJob]::CloseHandle($job);$entry.Job=[IntPtr]::Zero;$exited=([RevivalJob]::WaitForSingleObject($entry.Process,2000)-eq 0);[RevivalJob]::CloseHandle($entry.Process)|Out-Null;$jobs.Remove($request.id);if(!$closed-or !$exited){throw "Renderer cleanup did not complete"}
   [Console]::Out.WriteLine((@{id=$request.id;ok=$true;peakPrivateBytes=$info.PeakProcessMemory.ToUInt64();peakJobBytes=$info.PeakJobMemory.ToUInt64();remainingJobs=$jobs.Count;processExited=$exited}|ConvertTo-Json -Compress))
  } else {throw 'Unknown operation'}
 } catch {[Console]::Out.WriteLine((@{id=$request.id;ok=$false;error=$_.Exception.Message}|ConvertTo-Json -Compress))}
}
} finally {foreach($entry in $jobs.Values){if($entry.Job-ne [IntPtr]::Zero){[RevivalJob]::CloseHandle($entry.Job)|Out-Null};[RevivalJob]::CloseHandle($entry.Process)|Out-Null}}
