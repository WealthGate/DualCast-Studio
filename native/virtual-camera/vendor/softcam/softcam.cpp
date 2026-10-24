#include "softcam.h"

#include <olectl.h>
#include <initguid.h>

#include <softcamcore/DShowSoftcam.h>
#include <softcamcore/SenderAPI.h>


// {C9233C98-4FC6-4C7C-B118-6CB0F6CB439B}
DEFINE_GUID(CLSID_DShowSoftcam,
0xc9233c98, 0x4fc6, 0x4c7c, 0xb1, 0x18, 0x6c, 0xb0, 0xf6, 0xcb, 0x43, 0x9b);


namespace {

// Setup data

const wchar_t FILTER_NAME[] = L"OpenChurch Virtual Camera";
const GUID &FILTER_CLASSID = CLSID_DShowSoftcam;

const AMOVIESETUP_MEDIATYPE s_pin_types[] =
{
    {
        &MEDIATYPE_Video,       // Major type
        &MEDIASUBTYPE_NULL      // Minor type
    }
};

const AMOVIESETUP_PIN s_pins[] =
{
    {
        const_cast<LPWSTR>(L"Output"),  // Pin string name
        FALSE,                  // Is it rendered
        TRUE,                   // Is it an output
        FALSE,                  // Can we have none
        FALSE,                  // Can we have many
        &CLSID_NULL,            // Connects to filter
        NULL,                   // Connects to pin
        1,                      // Number of types
        s_pin_types             // Pin details
    }
};

const REGFILTER2 s_reg_filter2 =
{
    1,
    MERIT_DO_NOT_USE,
    1,
    s_pins
};

CUnknown * WINAPI CreateSoftcamInstance(LPUNKNOWN lpunk, HRESULT *phr)
{
    return softcam::Softcam::CreateInstance(lpunk, FILTER_CLASSID, phr);
}

} // namespace

// COM global table of objects in this dll

CFactoryTemplate g_Templates[] =
{
    {
        FILTER_NAME,
        &FILTER_CLASSID,
        &CreateSoftcamInstance,
        NULL,
        nullptr
    }
};
int g_cTemplates = sizeof(g_Templates) / sizeof(g_Templates[0]);


// OpenChurch per-user COM and capture-category registration. The camera is
// discovered through System Device Enumerator; it is not an intelligent-connect filter.
// Registry layout: https://learn.microsoft.com/windows/win32/directshow/layout-of-the-registry-keys
namespace {
const wchar_t CLASS_KEY[] = L"Software\\Classes\\CLSID\\{C9233C98-4FC6-4C7C-B118-6CB0F6CB439B}";
const wchar_t INSTANCE_KEY[] = L"Software\\Classes\\CLSID\\{860BB310-5D01-11D0-BD3B-00A0C911CE86}\\Instance\\{C9233C98-4FC6-4C7C-B118-6CB0F6CB439B}";
HRESULT WriteString(const wchar_t* key, const wchar_t* name, const wchar_t* value) {
    HKEY handle = nullptr;
    LSTATUS error = RegCreateKeyExW(HKEY_CURRENT_USER, key, 0, nullptr, 0, KEY_SET_VALUE, nullptr, &handle, nullptr);
    if (error != ERROR_SUCCESS) return HRESULT_FROM_WIN32(error);
    error = RegSetValueExW(handle, name, 0, REG_SZ, reinterpret_cast<const BYTE*>(value), static_cast<DWORD>((wcslen(value) + 1) * sizeof(wchar_t)));
    RegCloseKey(handle); return HRESULT_FROM_WIN32(error);
}
HRESULT RemoveKey(const wchar_t* key) {
    LSTATUS error = RegDeleteTreeW(HKEY_CURRENT_USER, key);
    return error == ERROR_FILE_NOT_FOUND ? S_OK : HRESULT_FROM_WIN32(error);
}
}
STDAPI DllRegisterServer() {
    extern HINSTANCE g_hInst;
    wchar_t file[32768];
    if (!GetModuleFileNameW(g_hInst, file, 32768)) return HRESULT_FROM_WIN32(GetLastError());
    HRESULT hr = WriteString(CLASS_KEY, nullptr, FILTER_NAME);
    if (FAILED(hr)) return hr;
    const wchar_t inproc[] = L"Software\\Classes\\CLSID\\{C9233C98-4FC6-4C7C-B118-6CB0F6CB439B}\\InprocServer32";
    hr = WriteString(inproc, nullptr, file); if (FAILED(hr)) return hr;
    hr = WriteString(inproc, L"ThreadingModel", L"Both"); if (FAILED(hr)) return hr;
    hr = WriteString(INSTANCE_KEY, L"CLSID", L"{C9233C98-4FC6-4C7C-B118-6CB0F6CB439B}"); if (FAILED(hr)) return hr;
    return WriteString(INSTANCE_KEY, L"FriendlyName", FILTER_NAME);
}
STDAPI DllUnregisterServer() {
    HRESULT first = RemoveKey(INSTANCE_KEY);
    HRESULT second = RemoveKey(CLASS_KEY);
    return FAILED(first) ? first : second;
}

extern "C" BOOL WINAPI DllEntryPoint(HINSTANCE, ULONG, LPVOID);

BOOL APIENTRY DllMain(HANDLE hModule, DWORD  dwReason, LPVOID lpReserved)
{
    return DllEntryPoint((HINSTANCE)(hModule), dwReason, lpReserved);
}


//
// Softcam Sender API
//

extern "C" scCamera scCreateCamera(int width, int height, float framerate)
{
    return softcam::sender::CreateCamera(width, height, framerate);
}

extern "C" void     scDeleteCamera(scCamera camera)
{
    return softcam::sender::DeleteCamera(camera);
}

extern "C" void     scSendFrame(scCamera camera, const void* image_bits)
{
    return softcam::sender::SendFrame(camera, image_bits);
}

extern "C" bool     scWaitForConnection(scCamera camera, float timeout)
{
    return softcam::sender::WaitForConnection(camera, timeout);
}

extern "C" bool     scIsConnected(scCamera camera)
{
    return softcam::sender::IsConnected(camera);
}
