// OpenChurch camera sender and per-user installation helper. MIT license.
#include <windows.h>
#include <objbase.h>
#include <dshow.h>
#include <cstdio>
#include <fcntl.h>
#include <io.h>
#include <vector>
#include <string>

int wmain(int argc, wchar_t** argv) {
    wchar_t self[32768];
    if (!GetModuleFileNameW(nullptr, self, 32768)) return 2;
    std::wstring file(self);
    file = file.substr(0, file.find_last_of(L"\\/") + 1) + L"openchurch-camera.dll";
    HMODULE dll = LoadLibraryExW(file.c_str(), nullptr, LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_SYSTEM32);
    if (!dll) { std::fprintf(stderr, "Cannot load camera component: %lu\n", GetLastError()); return 2; }
    if (argc == 2 && std::wstring(argv[1]) == L"--status") {
        wchar_t registered[32768]; DWORD bytes = sizeof(registered);
        if (RegGetValueW(HKEY_CURRENT_USER, L"Software\\Classes\\CLSID\\{C9233C98-4FC6-4C7C-B118-6CB0F6CB439B}\\InprocServer32", nullptr, RRF_RT_REG_SZ, nullptr, registered, &bytes) != ERROR_SUCCESS) return 6;
        return GetFileAttributesW(registered) == INVALID_FILE_ATTRIBUTES ? 6 : 0;
    }
    if (argc == 2 && std::wstring(argv[1]) == L"--probe") {
        CoInitializeEx(nullptr, COINIT_MULTITHREADED);
        CLSID cameraId; CLSIDFromString(L"{C9233C98-4FC6-4C7C-B118-6CB0F6CB439B}", &cameraId);
        IBaseFilter* filter = nullptr;
        HRESULT hr = CoCreateInstance(cameraId, nullptr, CLSCTX_INPROC_SERVER, IID_IBaseFilter, reinterpret_cast<void**>(&filter));
        if (FAILED(hr)) { std::fprintf(stderr, "Cannot instantiate camera: %08lx\n", hr); return 7; }
        IAMStreamConfig* config = nullptr; AM_MEDIA_TYPE* type = nullptr;
        hr = filter->QueryInterface(IID_IAMStreamConfig, reinterpret_cast<void**>(&config));
        if (SUCCEEDED(hr)) hr = config->GetFormat(&type);
        bool valid = SUCCEEDED(hr) && type && type->cbFormat >= sizeof(VIDEOINFOHEADER);
        if (valid) { auto format = reinterpret_cast<VIDEOINFOHEADER*>(type->pbFormat); valid = format->bmiHeader.biWidth == 1280 && format->bmiHeader.biHeight == 720 && format->AvgTimePerFrame == 333333; }
        if (type) { CoTaskMemFree(type->pbFormat); CoTaskMemFree(type); }
        if (config) config->Release(); filter->Release(); CoUninitialize();
        if (valid) std::puts("1280x720@30");
        return valid ? 0 : 7;
    }
    if (argc == 2 && (std::wstring(argv[1]) == L"--install" || std::wstring(argv[1]) == L"--uninstall")) {
        // The DLL writes only this account's Classes keys, in its architecture's view.
        const char* name = std::wstring(argv[1]) == L"--install" ? "DllRegisterServer" : "DllUnregisterServer";
        auto action = reinterpret_cast<HRESULT (STDAPICALLTYPE*)()>(GetProcAddress(dll, name));
        HRESULT hr = action ? action() : E_FAIL;
        if (FAILED(hr)) { std::fprintf(stderr, "Camera registration failed: 0x%08lx\n", static_cast<unsigned long>(hr)); return 3; }
        std::puts("ok"); return 0;
    }
    if (argc != 2 || std::wstring(argv[1]) != L"--send") return 2;
    auto create = reinterpret_cast<void* (*)(int, int, float)>(GetProcAddress(dll, "scCreateCamera"));
    auto send = reinterpret_cast<void (*)(void*, const void*)>(GetProcAddress(dll, "scSendFrame"));
    auto destroy = reinterpret_cast<void (*)(void*)>(GetProcAddress(dll, "scDeleteCamera"));
    if (!create || !send || !destroy) return 2;
    void* camera = create(1280, 720, 30);
    if (!camera) { std::fputs("Camera output is already in use. Close the other OpenChurch instance or camera sender.\n", stderr); return 4; }
    _setmode(_fileno(stdin), _O_BINARY);
    setvbuf(stdout, nullptr, _IONBF, 0);
    std::vector<unsigned char> rgba(1280 * 720 * 4), bgr(1280 * 720 * 3);
    send(camera, bgr.data()); // A newly started camera never exposes the previous session.
    std::puts("ready");
    for (;;) {
        size_t offset = 0;
        while (offset < rgba.size()) {
            size_t count = std::fread(rgba.data() + offset, 1, rgba.size() - offset, stdin);
            if (!count) { destroy(camera); return offset ? 5 : 0; }
            offset += count;
        }
        for (size_t i = 0, j = 0; i < rgba.size(); i += 4, j += 3) {
            bgr[j] = rgba[i + 2]; bgr[j + 1] = rgba[i + 1]; bgr[j + 2] = rgba[i];
        }
        send(camera, bgr.data());
        std::puts("frame"); // One acknowledged frame at a time; no growing frame queue.
    }
}
