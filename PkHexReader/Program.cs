using System.Text.Json;
using PKHeX.Core;

if (args.Length < 1)
{
    Console.WriteLine("{\"error\":\"Usage: PkHexReader <savefile>\"}");
    return;
}

string filePath = args[0];
if (!File.Exists(filePath))
{
    Console.WriteLine("{\"error\":\"File not found: " + filePath + "\"}");
    return;
}

byte[] data = File.ReadAllBytes(filePath);
data = TrimDsv(data);
Console.Error.WriteLine($"[PkHexReader] Trimmed to {data.Length} bytes (0x{data.Length:X})");
var SAV = SaveUtil.GetVariantSAV(data, filePath);
if (SAV == null)
{
    Console.Error.WriteLine($"[PkHexReader] GetVariantSAV returned null for {data.Length} bytes");
    Console.WriteLine("{\"error\":\"Could not detect save format\"}");
    return;
}

var partyData = SAV.PartyData;
var partyCount = SAV.PartyCount;

var pokemonList = new List<Dictionary<string, object?>>();

for (int i = 0; i < partyCount && i < partyData.Count; i++)
{
    var pk = partyData[i];
    if (pk == null || pk.Species == 0) continue;

    var mon = new Dictionary<string, object?>
    {
        ["speciesId"] = (int)pk.Species,
        ["nickname"] = pk.Nickname ?? "",
        ["otName"] = pk.OriginalTrainerName ?? "",
        ["level"] = (int)pk.CurrentLevel,
        ["isShiny"] = pk.IsShiny,
        ["form"] = (int)pk.Form,
        ["gender"] = (int)pk.Gender,
        ["heldItem"] = pk.HeldItem,
        ["ability"] = pk.Ability,
        ["nature"] = (int)pk.Nature,
        ["pid"] = pk.PID,
        ["tid"] = (int)pk.TID16,
        ["sid"] = (int)pk.SID16,
        ["currentHp"] = pk.Stat_HPCurrent,
        ["maxHp"] = pk.Stat_HPMax,
        ["move1"] = (int)pk.Move1,
        ["move2"] = (int)pk.Move2,
        ["move3"] = (int)pk.Move3,
        ["move4"] = (int)pk.Move4,
    };

    pokemonList.Add(mon);
}

var result = new Dictionary<string, object>
{
    ["game"] = SAV.Version.ToString(),
    ["version"] = SAV.Version.ToString(),
    ["generation"] = (int)SAV.Generation,
    ["partyCount"] = partyCount,
    ["pokemon"] = pokemonList
};

var options = new JsonSerializerOptions { WriteIndented = false, Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping };
Console.WriteLine(JsonSerializer.Serialize(result, options));

static byte[] TrimDsv(byte[] data)
{
    if (data.Length < 128) return data;
    if (data.Length > 0x80000 && data.Length <= 0x81000)
    {
        // Check for DSV footer
        var tail = System.Text.Encoding.ASCII.GetString(data, Math.Max(0, data.Length - 256), Math.Min(256, data.Length));
        int snipIdx = tail.IndexOf("|<--", StringComparison.Ordinal);
        if (snipIdx >= 0)
        {
            int trimTo = data.Length - 256 + snipIdx;
            if (trimTo > 0 && trimTo < data.Length)
            {
                var trimmed = new byte[trimTo];
                Array.Copy(data, trimmed, trimTo);
                return trimmed;
            }
        }
        // Fallback: trim to 512KB
        var fallback = new byte[0x80000];
        Array.Copy(data, fallback, 0x80000);
        return fallback;
    }
    return data;
}
