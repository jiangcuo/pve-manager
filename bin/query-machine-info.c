/* arm-cpu-detect.c - 通用 ARM CPU 识别 (基于 util-linux 最新版) */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>
#include <stdint.h>
#include <sys/stat.h>

#define OUTPUT_DIR "/run/pve"
#define OUTPUT_FILE "/run/pve/query-machine-info"

struct id_part { int id; const char *name; };

/* ARM 核心 */
static const struct id_part arm_part[] = {
    { 0x810, "ARM810" },
    { 0x920, "ARM920" },
    { 0x922, "ARM922" },
    { 0x926, "ARM926" },
    { 0x940, "ARM940" },
    { 0x946, "ARM946" },
    { 0x966, "ARM966" },
    { 0xa20, "ARM1020" },
    { 0xa22, "ARM1022" },
    { 0xa26, "ARM1026" },
    { 0xb02, "ARM11-MPCore" },
    { 0xb36, "ARM1136" },
    { 0xb56, "ARM1156" },
    { 0xb76, "ARM1176" },
    { 0xc05, "Cortex-A5" },
    { 0xc07, "Cortex-A7" },
    { 0xc08, "Cortex-A8" },
    { 0xc09, "Cortex-A9" },
    { 0xc0d, "Cortex-A17" },
    { 0xc0f, "Cortex-A15" },
    { 0xc0e, "Cortex-A17" },
    { 0xc14, "Cortex-R4" },
    { 0xc15, "Cortex-R5" },
    { 0xc17, "Cortex-R7" },
    { 0xc18, "Cortex-R8" },
    { 0xc20, "Cortex-M0" },
    { 0xc21, "Cortex-M1" },
    { 0xc23, "Cortex-M3" },
    { 0xc24, "Cortex-M4" },
    { 0xc27, "Cortex-M7" },
    { 0xc60, "Cortex-M0+" },
    { 0xd01, "Cortex-A32" },
    { 0xd02, "Cortex-A34" },
    { 0xd03, "Cortex-A53" },
    { 0xd04, "Cortex-A35" },
    { 0xd05, "Cortex-A55" },
    { 0xd06, "Cortex-A65" },
    { 0xd07, "Cortex-A57" },
    { 0xd08, "Cortex-A72" },
    { 0xd09, "Cortex-A73" },
    { 0xd0a, "Cortex-A75" },
    { 0xd0b, "Cortex-A76" },
    { 0xd0c, "Neoverse-N1" },
    { 0xd0d, "Cortex-A77" },
    { 0xd0e, "Cortex-A76AE" },
    { 0xd13, "Cortex-R52" },
    { 0xd14, "Cortex-R82AE" },
    { 0xd15, "Cortex-R82" },
    { 0xd16, "Cortex-R52+" },
    { 0xd20, "Cortex-M23" },
    { 0xd21, "Cortex-M33" },
    { 0xd22, "Cortex-M55" },
    { 0xd23, "Cortex-M85" },
    { 0xd24, "Cortex-M52" },
    { 0xd40, "Neoverse-V1" },
    { 0xd41, "Cortex-A78" },
    { 0xd42, "Cortex-A78AE" },
    { 0xd43, "Cortex-A65AE" },
    { 0xd44, "Cortex-X1" },
    { 0xd46, "Cortex-A510" },
    { 0xd47, "Cortex-A710" },
    { 0xd48, "Cortex-X2" },
    { 0xd49, "Neoverse-N2" },
    { 0xd4a, "Neoverse-E1" },
    { 0xd4b, "Cortex-A78C" },
    { 0xd4c, "Cortex-X1C" },
    { 0xd4d, "Cortex-A715" },
    { 0xd4e, "Cortex-X3" },
    { 0xd4f, "Neoverse-V2" },
    { 0xd80, "Cortex-A520" },
    { 0xd81, "Cortex-A720" },
    { 0xd82, "Cortex-X4" },
    { 0xd83, "Neoverse-V3AE" },
    { 0xd84, "Neoverse-V3" },
    { 0xd85, "Cortex-X925" },
    { 0xd87, "Cortex-A725" },
    { 0xd88, "Cortex-A520AE" },
    { 0xd89, "Cortex-A720AE" },
    { 0xd8a, "C1-Nano" },
    { 0xd8b, "C1-Pro" },
    { 0xd8c, "C1-Ultra" },
    { 0xd8e, "Neoverse-N3" },
    { 0xd8f, "Cortex-A320" },
    { 0xd90, "C1-Premium" },
    { -1, "unknown" },
};

/* Broadcom */
static const struct id_part brcm_part[] = {
    { 0x0f, "Brahma-B15" },
    { 0x100, "Brahma-B53" },
    { 0x516, "ThunderX2" },
    { -1, "unknown" },
};

/* DEC */
static const struct id_part dec_part[] = {
    { 0xa10, "SA110" },
    { 0xa11, "SA1100" },
    { -1, "unknown" },
};

/* Cavium */
static const struct id_part cavium_part[] = {
    { 0x0a0, "ThunderX" },
    { 0x0a1, "ThunderX-88XX" },
    { 0x0a2, "ThunderX-81XX" },
    { 0x0a3, "ThunderX-83XX" },
    { 0x0af, "ThunderX2-99xx" },
    { 0x0b0, "OcteonTX2" },
    { 0x0b1, "OcteonTX2-98XX" },
    { 0x0b2, "OcteonTX2-96XX" },
    { 0x0b3, "OcteonTX2-95XX" },
    { 0x0b4, "OcteonTX2-95XXN" },
    { 0x0b5, "OcteonTX2-95XXMM" },
    { 0x0b6, "OcteonTX2-95XXO" },
    { 0x0b8, "ThunderX3-T110" },
    { -1, "unknown" },
};

/* APM */
static const struct id_part apm_part[] = {
    { 0x000, "X-Gene" },
    { -1, "unknown" },
};

/* Qualcomm */
static const struct id_part qcom_part[] = {
    { 0x001, "Oryon" },
    { 0x00f, "Scorpion" },
    { 0x02d, "Scorpion" },
    { 0x04d, "Krait" },
    { 0x06f, "Krait" },
    { 0x201, "Kryo" },
    { 0x205, "Kryo" },
    { 0x211, "Kryo" },
    { 0x800, "Falkor-V1/Kryo" },
    { 0x801, "Kryo-V2" },
    { 0x802, "Kryo-3XX-Gold" },
    { 0x803, "Kryo-3XX-Silver" },
    { 0x804, "Kryo-4XX-Gold" },
    { 0x805, "Kryo-4XX-Silver" },
    { 0xc00, "Falkor" },
    { 0xc01, "Saphira" },
    { -1, "unknown" },
};

/* Samsung */
static const struct id_part samsung_part[] = {
    { 0x001, "exynos-m1" },
    { 0x002, "exynos-m3" },
    { 0x003, "exynos-m4" },
    { 0x004, "exynos-m5" },
    { -1, "unknown" },
};

/* NVIDIA */
static const struct id_part nvidia_part[] = {
    { 0x000, "Denver" },
    { 0x003, "Denver-2" },
    { 0x004, "Carmel" },
    { 0x010, "Olympus" },
    { -1, "unknown" },
};

/* Marvell */
static const struct id_part marvell_part[] = {
    { 0x131, "Feroceon-88FR131" },
    { 0x581, "PJ4/PJ4b" },
    { 0x584, "PJ4B-MP" },
    { -1, "unknown" },
};

/* Apple */
static const struct id_part apple_part[] = {
    { 0x000, "Swift" },
    { 0x001, "Cyclone" },
    { 0x002, "Typhoon" },
    { 0x003, "Typhoon/Capri" },
    { 0x004, "Twister" },
    { 0x005, "Twister/Elba/Malta" },
    { 0x006, "Hurricane" },
    { 0x007, "Hurricane/Myst" },
    { 0x008, "Monsoon" },
    { 0x009, "Mistral" },
    { 0x00b, "Vortex" },
    { 0x00c, "Tempest" },
    { 0x00f, "Tempest-M9" },
    { 0x010, "Vortex/Aruba" },
    { 0x011, "Tempest/Aruba" },
    { 0x012, "Lightning" },
    { 0x013, "Thunder" },
    { 0x020, "Icestorm-A14" },
    { 0x021, "Firestorm-A14" },
    { 0x022, "Icestorm-M1" },
    { 0x023, "Firestorm-M1" },
    { 0x024, "Icestorm-M1-Pro" },
    { 0x025, "Firestorm-M1-Pro" },
    { 0x026, "Thunder-M10" },
    { 0x028, "Icestorm-M1-Max" },
    { 0x029, "Firestorm-M1-Max" },
    { 0x030, "Blizzard-A15" },
    { 0x031, "Avalanche-A15" },
    { 0x032, "Blizzard-M2" },
    { 0x033, "Avalanche-M2" },
    { 0x034, "Blizzard-M2-Pro" },
    { 0x035, "Avalanche-M2-Pro" },
    { 0x036, "Sawtooth-A16" },
    { 0x037, "Everest-A16" },
    { 0x038, "Blizzard-M2-Max" },
    { 0x039, "Avalanche-M2-Max" },
    { -1, "unknown" },
};

/* Faraday */
static const struct id_part faraday_part[] = {
    { 0x526, "FA526" },
    { 0x626, "FA626" },
    { -1, "unknown" },
};

/* Intel XScale */
static const struct id_part intel_part[] = {
    { 0x200, "i80200" },
    { 0x210, "PXA250A" },
    { 0x212, "PXA210A" },
    { 0x242, "i80321-400" },
    { 0x243, "i80321-600" },
    { 0x290, "PXA250B/PXA26x" },
    { 0x292, "PXA210B" },
    { 0x2c2, "i80321-400-B0" },
    { 0x2c3, "i80321-600-B0" },
    { 0x2d0, "PXA250C/PXA255/PXA26x" },
    { 0x2d2, "PXA210C" },
    { 0x411, "PXA27x" },
    { 0x41c, "IPX425-533" },
    { 0x41d, "IPX425-400" },
    { 0x41f, "IPX425-266" },
    { 0x682, "PXA32x" },
    { 0x683, "PXA930/PXA935" },
    { 0x688, "PXA30x" },
    { 0x689, "PXA31x" },
    { 0xb11, "SA1110" },
    { 0xc12, "IPX1200" },
    { -1, "unknown" },
};

/* Fujitsu */
static const struct id_part fujitsu_part[] = {
    { 0x001, "A64FX" },
    { 0x003, "MONAKA" },
    { -1, "unknown" },
};

/* HiSilicon */
static const struct id_part hisi_part[] = {
    { 0xd01, "TaiShan-v110" },
    { 0xd02, "TaiShan-v120" },
    { 0xd40, "Cortex-A76" },
    { 0xd41, "Cortex-A77" },
    { -1, "unknown" },
};

/* Ampere */
static const struct id_part ampere_part[] = {
    { 0xac3, "Ampere-1" },
    { 0xac4, "Ampere-1a" },
    { -1, "unknown" },
};

/* Phytium */
static const struct id_part ft_part[] = {
    { 0x303, "FTC310" },
    { 0x660, "FTC660" },
    { 0x661, "FTC661" },
    { 0x662, "FTC662" },
    { 0x663, "FTC663" },
    { 0x664, "FTC664" },
    { 0x862, "FTC862" },
    { -1, "unknown" },
};

/* Microsoft */
static const struct id_part ms_part[] = {
    { 0xd49, "Azure-Cobalt-100" },
    { -1, "unknown" },
};

/* Unknown fallback */
static const struct id_part unknown_part[] = {
    { -1, "unknown" },
};

struct hw_impl {
    int id;
    const struct id_part *parts;
    const char *vendor;
};

static const struct hw_impl hw_implementer[] = {
    { 0x41, arm_part,     "ARM" },
    { 0x42, brcm_part,    "Broadcom" },
    { 0x43, cavium_part,  "Cavium" },
    { 0x44, dec_part,     "DEC" },
    { 0x46, fujitsu_part, "FUJITSU" },
    { 0x48, hisi_part,    "HiSilicon" },
    { 0x49, unknown_part, "Infineon" },
    { 0x4d, unknown_part, "Motorola/Freescale" },
    { 0x4e, nvidia_part,  "NVIDIA" },
    { 0x50, apm_part,     "APM" },
    { 0x51, qcom_part,    "Qualcomm" },
    { 0x53, samsung_part, "Samsung" },
    { 0x56, marvell_part, "Marvell" },
    { 0x61, apple_part,   "Apple" },
    { 0x66, faraday_part, "Faraday" },
    { 0x69, intel_part,   "Intel" },
    { 0x6d, ms_part,      "Microsoft" },
    { 0x70, ft_part,      "Phytium" },
    { 0xc0, ampere_part,  "Ampere" },
    { -1,   unknown_part, "Unknown" },
};

static int parse_id(const char *str)
{
    int id;
    char *end = NULL;
    
    if (!str || strncmp(str, "0x", 2) != 0)
        return -1;
    
    errno = 0;
    id = (int) strtol(str, &end, 0);
    if (errno || str == end)
        return -1;
    
    return id;
}

static char *skip_blank(char *s)
{
    while (s && (*s == ' ' || *s == '\t')) {
        s++;
    }
    return s;
}

static const char *lookup_part(const struct id_part *parts, int id)
{
    if (!parts) return NULL;
    for (int i = 0; parts[i].id != -1; i++)
        if (parts[i].id == id) return parts[i].name;
    return NULL;
}

static const struct hw_impl *lookup_impl(int id)
{
    for (int i = 0; hw_implementer[i].id != -1; i++)
        if (hw_implementer[i].id == id) return &hw_implementer[i];
    return &hw_implementer[19];
}

struct dmi_header {
    uint8_t type;
    uint8_t length;
    uint16_t handle;
};

static char *dmi_get_string(uint8_t *data, uint8_t str_index)
{
    char *p = (char *)(data + ((struct dmi_header *)data)->length);
    if (!str_index) return NULL;
    
    while (str_index > 1 && *p) {
        p += strlen(p);
        p++;
        str_index--;
    }
    return *p ? p : NULL;
}

static int read_bios_modelname_from_dmi(char *buf, size_t buflen)
{
    const char *dmi_path = "/sys/firmware/dmi/tables/DMI";
    struct stat st;
    uint8_t *data, *p;
    int found = 0;

    buf[0] = '\0';

    if (stat(dmi_path, &st) != 0) return 0;
    
    FILE *fp = fopen(dmi_path, "rb");
    if (!fp) return 0;
    
    data = malloc(st.st_size);
    if (!data) {
        fclose(fp);
        return 0;
    }
    
    if (fread(data, 1, st.st_size, fp) != (size_t)st.st_size) {
        free(data);
        fclose(fp);
        return 0;
    }
    fclose(fp);
    
    p = data;
    while (p + 4 <= data + st.st_size) {
        struct dmi_header *h = (struct dmi_header *)p;
        uint8_t *next;
        char *processor_version = NULL;
        char *part_num = NULL;
        unsigned int current_speed = 0;
        unsigned int max_speed = 0;
        unsigned int speed = 0;

        if (h->length < 4) break;

        next = p + h->length;
        while (next - data + 1 < st.st_size && (next[0] != 0 || next[1] != 0))
            next++;
        next += 2;
        
        if (h->type == 4) {
            if (h->length > 0x10) {
                processor_version = dmi_get_string(p, p[0x10]);
            }
            if (h->length > 0x22) {
                part_num = dmi_get_string(p, p[0x22]);
            }
            if (h->length > 0x15) {
                max_speed = (unsigned int)p[0x14] | ((unsigned int)p[0x15] << 8);
            }
            if (h->length > 0x17) {
                current_speed = (unsigned int)p[0x16] | ((unsigned int)p[0x17] << 8);
            }

            if (processor_version && strstr(processor_version, " CPU @ ")) {
                snprintf(buf, buflen, "%s", processor_version);
            } else {
                speed = current_speed > max_speed ? current_speed : max_speed;
                snprintf(buf, buflen, "%s %s CPU @ %d.%dGHz",
                    processor_version ? processor_version : "",
                    part_num ? part_num : "",
                    speed / 1000,
                    (speed % 1000) / 100);
            }
            found = 1;
            break;
        }

        p = next;
    }
    
    free(data);
    return found;
}

static void read_bios_modelname(char *buf, size_t buflen)
{
    buf[0] = '\0';
    read_bios_modelname_from_dmi(buf, buflen);
}

static char *json_escape(const char *src)
{
    size_t len = 0;
    const char *p;
    char *out;
    char *q;

    if (!src) {
        src = "";
    }

    for (p = src; *p; p++) {
        switch (*p) {
        case '\\':
        case '"':
            len += 2;
            break;
        case '\n':
        case '\r':
        case '\t':
            len += 2;
            break;
        default:
            len += 1;
            break;
        }
    }

    out = malloc(len + 1);
    if (!out) {
        return NULL;
    }

    q = out;
    for (p = src; *p; p++) {
        switch (*p) {
        case '\\':
            *q++ = '\\';
            *q++ = '\\';
            break;
        case '"':
            *q++ = '\\';
            *q++ = '"';
            break;
        case '\n':
            *q++ = '\\';
            *q++ = 'n';
            break;
        case '\r':
            *q++ = '\\';
            *q++ = 'r';
            break;
        case '\t':
            *q++ = '\\';
            *q++ = 't';
            break;
        default:
            *q++ = *p;
            break;
        }
    }

    *q = '\0';
    return out;
}

static int ensure_output_dir(void)
{
    struct stat st;

    if (stat(OUTPUT_DIR, &st) == 0) {
        return S_ISDIR(st.st_mode) ? 0 : -1;
    }

    if (errno != ENOENT) {
        return -1;
    }

    return mkdir(OUTPUT_DIR, 0755);
}

static int write_output_file(const char *cpuname)
{
    FILE *fp;
    char *escaped;

    if (ensure_output_dir() != 0) {
        return -1;
    }

    escaped = json_escape(cpuname);
    if (!escaped) {
        return -1;
    }

    fp = fopen(OUTPUT_FILE, "w");
    if (!fp) {
        free(escaped);
        return -1;
    }

    fprintf(fp, "[{\"cpu\":\"%s\"}]\n", escaped);
    fclose(fp);
    free(escaped);
    return 0;
}

int main()
{
    FILE *fp = fopen("/proc/cpuinfo", "r");
    if (!fp) { perror("fopen"); return 1; }

    int impl_id = -1, part_id = -1;
    char line[256];

    while (fgets(line, sizeof(line), fp)) {
        if (strncmp(line, "CPU implementer", 15) == 0) {
            char *p = strchr(line, ':');
            if (p) {
                p = skip_blank(p + 1);
                impl_id = parse_id(p) & 0xFF;
            }
        } else if (strncmp(line, "CPU part", 8) == 0) {
            char *p = strchr(line, ':');
            if (p) {
                p = skip_blank(p + 1);
                part_id = parse_id(p) & 0xFFF;
            }
        }
    }
    fclose(fp);

    const struct hw_impl *impl = lookup_impl(impl_id);
    const char *model_name = lookup_part(impl->parts, part_id);

    char bios_modelname[256];
    read_bios_modelname(bios_modelname, sizeof(bios_modelname));

    const char *cpuname = bios_modelname[0] ? bios_modelname : model_name;
    if (!cpuname || strcmp(cpuname, "-") == 0 || cpuname[0] == '\0') {
        cpuname = "unknown";
    }

    if (write_output_file(cpuname) != 0) {
        if (write_output_file("unknown") != 0) {
            perror("failed to write cpuinfo");
            return 1;
        }
    }

    return 0;
}